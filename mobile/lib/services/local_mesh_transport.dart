import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:bonsoir/bonsoir.dart';
import 'package:flutter/foundation.dart';
import 'package:universal_ble/universal_ble.dart';

import '../models/peer_model.dart';

/// Local, infrastructure-free transports used by the mobile mesh.
///
/// Wi-Fi uses a newline-delimited TCP stream advertised with Bonjour/Android
/// NSD. BLE uses one custom GATT service in both central and peripheral roles.
/// Both transports carry the same JSON envelope and therefore share the
/// encryption, deduplication, and chat code in MeshService.
class LocalPeerEvent {
  final PeerModel peer;
  final bool incoming;

  const LocalPeerEvent(this.peer, {this.incoming = false});
}

class LocalMeshTransport {
  static final LocalMeshTransport _instance = LocalMeshTransport._internal();
  factory LocalMeshTransport() => _instance;
  LocalMeshTransport._internal();

  static const serviceType = '_privychat._tcp';
  static const bleServiceUuid = '7e3b0001-7a4f-4e52-9e0f-000000000001';
  static const bleCharacteristicUuid = '7e3b0002-7a4f-4e52-9e0f-000000000002';
  static const _defaultPort = 45321;
  static const _discoveryPort = 45322;
  // A default ATT MTU is 23 bytes, leaving 20 bytes for an attribute write.
  // The five-byte header below therefore leaves 15 bytes for base64 data and
  // works even when MTU negotiation is unavailable.
  static const _bleChunkBytes = 15;
  static const _bleHeaderBytes = 5;

  final _peerEvents = StreamController<LocalPeerEvent>.broadcast();
  final _packetEvents = StreamController<Map<String, dynamic>>.broadcast();
  final Map<String, Socket> _tcpSockets = <String, Socket>{};
  final Map<Socket, String> _socketPeerIds = <Socket, String>{};
  final Map<String, BleDevice> _bleDevices = <String, BleDevice>{};
  final Map<String, BleCharacteristic> _bleCharacteristics = <String, BleCharacteristic>{};
  final Map<String, String> _blePeripheralDevices = <String, String>{};
  final Map<String, Map<String, List<String>>> _bleChunks = <String, Map<String, List<String>>>{};
  final Map<String, Completer<PeerModel>> _bleHelloWaiters = <String, Completer<PeerModel>>{};
  final Map<String, StreamSubscription<Uint8List>> _bleValueSubscriptions = <String, StreamSubscription<Uint8List>>{};

  ServerSocket? _server;
  BonsoirBroadcast? _broadcast;
  BonsoirDiscovery? _discovery;
  StreamSubscription<BonsoirDiscoveryEvent>? _discoverySubscription;
  RawDatagramSocket? _udpSocket;
  Timer? _udpDiscoveryTimer;
  String _id = '';
  String _nickname = 'Privy Agent';
  String _avatar = '🕵️';
  Map<String, dynamic>? _publicKey;
  int _port = _defaultPort;
  bool _started = false;
  int _bleTransferCounter = 0;
  bool _supportsTargetedCharacteristicUpdate = false;

  Stream<LocalPeerEvent> get peerEvents => _peerEvents.stream;
  Stream<Map<String, dynamic>> get packetEvents => _packetEvents.stream;
  bool get isStarted => _started;
  String get localId => _id;
  bool hasPeer(String id) => _tcpSockets.containsKey(id) || _bleCharacteristics.containsKey(id) || _blePeripheralDevices.containsKey(id);

  Future<void> start({
    required String id,
    required String nickname,
    required String avatar,
    required Map<String, dynamic>? publicKey,
  }) async {
    _id = id;
    _nickname = nickname;
    _avatar = avatar;
    _publicKey = publicKey;
    if (_started) return;
    _started = true;

    try {
      await _startTcp();
    } catch (error) {
      debugPrint('Local TCP transport unavailable: $error');
    }
    unawaited(_startUdpDiscovery());
    try {
      await _startBonjour();
    } catch (error) {
      debugPrint('Local Bonjour transport unavailable: $error');
    }
    try {
      await _startBle();
    } catch (error) {
      debugPrint('Local BLE transport unavailable: $error');
    }
  }

  Future<void> _startTcp() async {
    try {
      _server = await ServerSocket.bind(InternetAddress.anyIPv4, _defaultPort, shared: true);
    } catch (_) {
      // Another app instance may already hold the tactical port. A random
      // port still works because it is published in the mDNS service record.
      _server = await ServerSocket.bind(InternetAddress.anyIPv4, 0, shared: true);
    }
    _port = _server!.port;
    _server!.listen(_acceptSocket, onError: (Object error) {
      debugPrint('Local TCP server error: $error');
    });
  }

  Future<void> _startBonjour() async {
    try {
      if (_server == null) return;
      final encodedKey = _publicKey == null
          ? ''
          : base64Url.encode(utf8.encode(jsonEncode(_publicKey))).replaceAll('=', '');
      _broadcast = BonsoirBroadcast(
        service: BonsoirService(
          name: 'PrivyChat-$_nickname-$_id',
          type: serviceType,
          port: _port,
          attributes: <String, String>{
            'id': _id,
            'nick': _nickname,
            'avatar': _avatar,
            'key': encodedKey,
          },
        ),
      );
      await _broadcast!.initialize();
      await _broadcast!.start();

      _discovery = BonsoirDiscovery(type: serviceType);
      await _discovery!.initialize();
      _discoverySubscription = _discovery!.eventStream!.listen(_onBonjourEvent);
      await _discovery!.start();
    } catch (error) {
      debugPrint('Local Bonjour transport unavailable: $error');
    }
  }

  Future<void> _startUdpDiscovery() async {
    try {
      _udpSocket = await RawDatagramSocket.bind(
        InternetAddress.anyIPv4,
        _discoveryPort,
        reuseAddress: true,
        reusePort: true,
      );
      _udpSocket!.broadcastEnabled = true;
      _udpSocket!.listen((event) {
        if (event != RawSocketEvent.read) return;
        final datagram = _udpSocket?.receive();
        if (datagram == null) return;
        try {
          final data = Map<String, dynamic>.from(jsonDecode(utf8.decode(datagram.data)));
          if (data['kind'] != 'privychat_discovery' || data['id']?.toString() == _id) return;
          final peerId = data['id']?.toString() ?? datagram.address.address;
          final key = data['publicKey'] is Map
              ? Map<String, dynamic>.from(data['publicKey'])
              : null;
          final peer = PeerModel(
            id: peerId,
            nickname: data['nickname']?.toString() ?? 'Wi-Fi Agent',
            avatar: data['avatar']?.toString() ?? 'ðŸ•µï¸',
            mode: 'wifi',
            device: 'Local Wi-Fi',
            publicKey: key,
            signalStrength: 100,
          );
          final port = int.tryParse(data['port']?.toString() ?? '') ?? _defaultPort;
          _endpoints[peer.id] = _Endpoint(peer: peer, host: datagram.address.address, port: port);
          _peerEvents.add(LocalPeerEvent(peer));
        } catch (_) {
          // Ignore unrelated UDP broadcasts on the hotspot.
        }
      });
      _broadcastUdpDiscovery();
      _udpDiscoveryTimer = Timer.periodic(const Duration(seconds: 3), (_) => _broadcastUdpDiscovery());
    } catch (error) {
      debugPrint('Local UDP discovery unavailable: $error');
    }
  }

  void _broadcastUdpDiscovery() {
    final socket = _udpSocket;
    if (socket == null) return;
    final payload = utf8.encode(jsonEncode({
      'kind': 'privychat_discovery',
      'id': _id,
      'nickname': _nickname,
      'avatar': _avatar,
      'publicKey': _publicKey,
      'port': _port,
    }));
    try {
      socket.send(payload, InternetAddress('255.255.255.255'), _discoveryPort);
    } catch (error) {
      debugPrint('Local UDP discovery broadcast failed: $error');
    }
  }

  void _onBonjourEvent(BonsoirDiscoveryEvent event) {
    if (event is BonsoirDiscoveryServiceFoundEvent) {
      final service = event.service;
      if (service != null) unawaited(service.resolve(_discovery!.serviceResolver));
      return;
    }
    if (event is! BonsoirDiscoveryServiceResolvedEvent) return;
    final service = event.service;
    if (service == null) return;
    final peerId = service.attributes['id'] ?? service.name;
    if (peerId == _id) return;
    Map<String, dynamic>? key;
    final encodedKey = service.attributes['key'];
    if (encodedKey != null && encodedKey.isNotEmpty) {
      try {
        final raw = utf8.decode(base64Url.decode(base64Url.normalize(encodedKey)));
        key = Map<String, dynamic>.from(jsonDecode(raw));
      } catch (_) {
        key = null;
      }
    }
    final peer = PeerModel(
      id: peerId,
      nickname: service.attributes['nick'] ?? service.name,
      avatar: service.attributes['avatar'] ?? '🕵️',
      mode: 'wifi',
      device: 'Local Wi-Fi',
      publicKey: key,
      signalStrength: 100,
    );
    final host = service.hostAddress;
    if (host != null) {
      _endpoints[peer.id] = _Endpoint(peer: peer, host: host, port: service.port);
    }
    _peerEvents.add(LocalPeerEvent(peer));
  }

  final Map<String, _Endpoint> _endpoints = <String, _Endpoint>{};

  void _acceptSocket(Socket socket) {
    _readSocket(socket);
  }

  void _readSocket(Socket socket) {
    // Socket exposes Uint8List chunks, while Utf8Decoder accepts List<int>.
    // Bind the decoder explicitly so Dart's strict StreamTransformer variance
    // does not reject the TCP framing pipeline on newer SDKs.
    utf8.decoder.bind(socket.cast<List<int>>()).transform(const LineSplitter()).listen(
      (line) {
        try {
          final message = Map<String, dynamic>.from(jsonDecode(line));
          final kind = message['kind']?.toString();
          if (kind == 'hello' || kind == 'hello_ack') {
            final peer = PeerModel(
              id: message['id']?.toString() ?? 'wifi_peer',
              nickname: message['nickname']?.toString() ?? 'Wi-Fi Agent',
              avatar: message['avatar']?.toString() ?? '🕵️',
              mode: 'wifi',
              device: 'Local Wi-Fi',
              publicKey: message['publicKey'] is Map
                  ? Map<String, dynamic>.from(message['publicKey'])
                  : null,
            );
            _socketPeerIds[socket] = peer.id;
            _tcpSockets[peer.id] = socket;
            if (kind == 'hello') {
              socket.write('${jsonEncode(_helloEnvelope(ack: true))}\n');
              _peerEvents.add(LocalPeerEvent(peer, incoming: true));
            }
          } else if (kind == 'packet' && message['packet'] is Map) {
            _packetEvents.add({
              'transport': 'wifi',
              'from': _socketPeerIds[socket],
              'packet': Map<String, dynamic>.from(message['packet']),
            });
          }
        } catch (error) {
          debugPrint('Local Wi-Fi frame error: $error');
        }
      },
      onError: (Object error) => debugPrint('Local Wi-Fi stream error: $error'),
      onDone: () {
        final peerId = _socketPeerIds.remove(socket);
        if (peerId != null && identical(_tcpSockets[peerId], socket)) {
          _tcpSockets.remove(peerId);
        }
        socket.destroy();
      },
      cancelOnError: false,
    );
  }

  Map<String, dynamic> _helloEnvelope({bool ack = false}) => {
        'kind': ack ? 'hello_ack' : 'hello',
        'id': _id,
        'nickname': _nickname,
        'avatar': _avatar,
        'publicKey': _publicKey,
      };

  Future<void> connectWifi(PeerModel peer) async {
    final endpoint = _endpoints[peer.id];
    if (endpoint == null || endpoint.host == null || endpoint.port == null) {
      throw StateError('Local Wi-Fi endpoint is no longer available.');
    }
    if (_tcpSockets.containsKey(peer.id)) return;
    final socket = await Socket.connect(endpoint.host!, endpoint.port!, timeout: const Duration(seconds: 5));
    _tcpSockets[peer.id] = socket;
    _socketPeerIds[socket] = peer.id;
    _readSocket(socket);
    socket.write('${jsonEncode(_helloEnvelope())}\n');
  }

  Future<void> sendWifi(String peerId, Map<String, dynamic> packet) async {
    final socket = _tcpSockets[peerId];
    if (socket == null) throw StateError('Local Wi-Fi peer is not connected.');
    socket.write('${jsonEncode({'kind': 'packet', 'packet': packet})}\n');
    await socket.flush();
  }

  Future<void> _startBle() async {
    try {
      await UniversalBle.requestPermissions(withAndroidFineLocation: false);
      UniversalBle.onScanResult = _onBleScan;
      UniversalBlePeripheral.setWriteRequestHandlers(_onPeripheralWrite);

      final capabilities = await UniversalBlePeripheral.getCapabilities();
      _supportsTargetedCharacteristicUpdate = capabilities.supportsTargetedCharacteristicUpdate;
      if (capabilities.supportsPeripheralMode) {
        await UniversalBlePeripheral.clearServices();
        await UniversalBlePeripheral.addService(
          BlePeripheralService(
            uuid: bleServiceUuid,
            primary: true,
            characteristics: [
              BlePeripheralCharacteristic(
                uuid: bleCharacteristicUuid,
                properties: [CharacteristicProperty.write, CharacteristicProperty.notify],
                permissions: [
                  PeripheralAttributePermission.readable,
                  PeripheralAttributePermission.writeable,
                ],
                descriptors: [
                  BlePeripheralDescriptor(uuid: '00002902-0000-1000-8000-00805f9b34fb'),
                ],
              ),
            ],
          ),
        );
        await UniversalBlePeripheral.startAdvertising(
          services: [bleServiceUuid],
          localName: 'PrivyChat-${_nickname.substring(0, _nickname.length.clamp(1, 12).toInt())}',
        );
      }
      await UniversalBle.startScan(scanFilter: ScanFilter(withServices: [bleServiceUuid]));
    } catch (error) {
      debugPrint('BLE transport unavailable: $error');
    }
  }

  void _onBleScan(BleDevice device) {
    if (device.deviceId == _id) return;
    _bleDevices[device.deviceId] = device;
    final peer = PeerModel(
      id: device.deviceId,
      nickname: device.name?.isNotEmpty == true ? device.name! : 'BLE Agent',
      avatar: '🛰️',
      mode: 'ble',
      device: 'Bluetooth LE',
      signalStrength: device.rssi ?? 0,
    );
    _endpoints[peer.id] = _Endpoint(peer: peer);
    _peerEvents.add(LocalPeerEvent(peer));
  }

  Future<PeerModel?> connectBle(PeerModel peer) async {
    final device = _bleDevices[peer.id];
    if (device == null) throw StateError('BLE peer is no longer in range.');
    await device.connect(timeout: const Duration(seconds: 12));
    try {
      await device.requestMtu(247);
    } catch (_) {
      // MTU negotiation is optional; the compact frame works with MTU 23.
    }
    final characteristic = await device.getCharacteristic(
      bleCharacteristicUuid,
      service: bleServiceUuid,
    );
    await characteristic.notifications.subscribe();
    _bleCharacteristics[peer.id] = characteristic;
    final previousSubscription = _bleValueSubscriptions[peer.id];
    if (previousSubscription != null) await previousSubscription.cancel();
    _bleValueSubscriptions[peer.id] = characteristic.onValueReceived.listen(
      (value) => _handleBleFrame(peer.id, value),
    );
    final helloWaiter = Completer<PeerModel>();
    _bleHelloWaiters[peer.id] = helloWaiter;
    await _sendBleEnvelope(peer.id, _helloEnvelope());
    try {
      return await helloWaiter.future.timeout(const Duration(seconds: 6));
    } on TimeoutException {
      return peer;
    } finally {
      _bleHelloWaiters.remove(peer.id);
    }
  }

  PeripheralWriteRequestResult? _onPeripheralWrite(
    String deviceId,
    String characteristicId,
    int offset,
    Uint8List? value,
  ) {
    if (characteristicId.toLowerCase() == bleCharacteristicUuid.toLowerCase() && value != null) {
      _handleBleFrame(deviceId, value);
    }
    return PeripheralWriteRequestResult();
  }

  Future<void> _sendBleEnvelope(String peerId, Map<String, dynamic> envelope) async {
    final characteristic = _bleCharacteristics[peerId];
    if (characteristic == null) throw StateError('BLE characteristic is not connected.');
    final encoded = base64Url.encode(utf8.encode(jsonEncode(envelope)));
    final transferId = (++_bleTransferCounter) & 0xffff;
    final total = (encoded.length / _bleChunkBytes).ceil();
    if (total > 255) throw StateError('BLE packet is too large.');
    for (var index = 0; index < total; index++) {
      final start = index * _bleChunkBytes;
      final end = (start + _bleChunkBytes).clamp(0, encoded.length).toInt();
      final data = ascii.encode(encoded.substring(start, end));
      final frame = Uint8List(_bleHeaderBytes + data.length);
      frame[0] = 1;
      frame[1] = (transferId >> 8) & 0xff;
      frame[2] = transferId & 0xff;
      frame[3] = index;
      frame[4] = total;
      frame.setRange(_bleHeaderBytes, frame.length, data);
      await characteristic.write(frame, withResponse: true);
    }
  }

  void _handleBleFrame(String deviceId, Uint8List bytes) {
    try {
      String? transferId;
      int? index;
      int? total;
      String? data;
      if (bytes.length >= _bleHeaderBytes && bytes[0] == 1) {
        final id = (bytes[1] << 8) | bytes[2];
        transferId = id.toString();
        index = bytes[3];
        total = bytes[4];
        data = ascii.decode(bytes.sublist(_bleHeaderBytes), allowInvalid: false);
      } else {
        // Accept the JSON frame used by early development builds so an app
        // upgrade does not strand an already-connected peer.
        final frame = Map<String, dynamic>.from(jsonDecode(utf8.decode(bytes)));
        transferId = frame['id']?.toString();
        index = int.tryParse(frame['i']?.toString() ?? '');
        total = int.tryParse(frame['t']?.toString() ?? '');
        data = frame['d']?.toString();
      }
      if (transferId == null || index == null || total == null || data == null) return;
      final frameIndex = index!;
      final frameTotal = total!;
      final frameData = data!;
      final byTransfer = _bleChunks.putIfAbsent(deviceId, () => <String, List<String>>{});
      final parts = byTransfer.putIfAbsent(transferId, () => List<String>.filled(frameTotal, ''));
      if (frameIndex < 0 || frameIndex >= parts.length) return;
      parts[frameIndex] = frameData;
      if (parts.every((part) => part.isNotEmpty)) {
        byTransfer.remove(transferId);
        final envelope = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts.join()))));
        if (envelope is Map && (envelope['kind'] == 'hello' || envelope['kind'] == 'hello_ack')) {
          final peer = PeerModel(
            id: envelope['id']?.toString() ?? deviceId,
            nickname: envelope['nickname']?.toString() ?? 'BLE Agent',
            avatar: envelope['avatar']?.toString() ?? '🛰️',
            mode: 'ble',
            device: 'Bluetooth LE',
            publicKey: envelope['publicKey'] is Map
                ? Map<String, dynamic>.from(envelope['publicKey'])
                : null,
          );
          _endpoints[peer.id] = _Endpoint(peer: peer);
          final characteristic = _bleCharacteristics[deviceId];
          if (characteristic != null) {
            _bleCharacteristics[peer.id] = characteristic;
          } else {
            // This phone is the GATT peripheral. Keep the OS connection ID so
            // the same side can send notifications back after the handshake.
            _blePeripheralDevices[peer.id] = deviceId;
          }
          final waiter = _bleHelloWaiters[deviceId] ?? _bleHelloWaiters[peer.id];
          if (waiter != null && !waiter.isCompleted) waiter.complete(peer);
          if (envelope['kind'] == 'hello') {
            _peerEvents.add(LocalPeerEvent(peer, incoming: true));
            if (_bleCharacteristics.containsKey(peer.id)) {
              unawaited(_sendBleEnvelope(peer.id, _helloEnvelope(ack: true)));
            } else {
              unawaited(_notifyPeripheral(deviceId, _helloEnvelope(ack: true)));
            }
          }
        } else if (envelope is Map && envelope['kind'] == 'packet' && envelope['packet'] is Map) {
          _packetEvents.add({
            'transport': 'ble',
            'from': deviceId,
            'packet': Map<String, dynamic>.from(envelope['packet']),
          });
        }
      }
    } catch (error) {
      debugPrint('BLE frame error: $error');
    }
  }

  Future<void> _notifyPeripheral(String deviceId, Map<String, dynamic> envelope) async {
    try {
      final encoded = base64Url.encode(utf8.encode(jsonEncode(envelope)));
      final total = (encoded.length / _bleChunkBytes).ceil();
      if (total > 255) throw StateError('BLE packet is too large.');
      final transferId = (++_bleTransferCounter) & 0xffff;
      for (var index = 0; index < total; index++) {
        final start = index * _bleChunkBytes;
        final end = (start + _bleChunkBytes).clamp(0, encoded.length).toInt();
        final data = ascii.encode(encoded.substring(start, end));
        final frame = Uint8List(_bleHeaderBytes + data.length);
        frame[0] = 1;
        frame[1] = (transferId >> 8) & 0xff;
        frame[2] = transferId & 0xff;
        frame[3] = index;
        frame[4] = total;
        frame.setRange(_bleHeaderBytes, frame.length, data);
        await UniversalBlePeripheral.updateCharacteristicValue(
          characteristicId: bleCharacteristicUuid,
          value: frame,
          deviceId: _supportsTargetedCharacteristicUpdate ? deviceId : null,
        );
      }
    } catch (error) {
      debugPrint('BLE notify error: $error');
    }
  }

  Future<void> sendBle(String peerId, Map<String, dynamic> packet) {
    final characteristic = _bleCharacteristics[peerId];
    if (characteristic != null) {
      return _sendBleEnvelope(peerId, {'kind': 'packet', 'packet': packet});
    }
    final deviceId = _blePeripheralDevices[peerId];
    if (deviceId != null) {
      return _notifyPeripheral(deviceId, {'kind': 'packet', 'packet': packet});
    }
    return Future<void>.error(StateError('Bluetooth peer is not connected.'));
  }

  Future<void> stop() async {
    if (!_started) return;
    _started = false;
    await _discoverySubscription?.cancel();
    _discoverySubscription = null;
    _udpDiscoveryTimer?.cancel();
    _udpDiscoveryTimer = null;
    _udpSocket?.close();
    _udpSocket = null;
    await _discovery?.stop();
    await _broadcast?.stop();
    await _server?.close();
    _server = null;
    for (final socket in _tcpSockets.values) {
      socket.destroy();
    }
    _tcpSockets.clear();
    _socketPeerIds.clear();
    for (final subscription in _bleValueSubscriptions.values) {
      await subscription.cancel();
    }
    _bleValueSubscriptions.clear();
    _bleCharacteristics.clear();
    _blePeripheralDevices.clear();
    _bleDevices.clear();
    _bleChunks.clear();
    _bleHelloWaiters.clear();
    _endpoints.clear();
    try {
      await UniversalBle.stopScan();
      await UniversalBlePeripheral.stopAdvertising();
      await UniversalBlePeripheral.clearServices();
    } catch (_) {}
  }
}

class _Endpoint {
  final PeerModel peer;
  final String? host;
  final int? port;

  const _Endpoint({required this.peer, this.host, this.port});
}

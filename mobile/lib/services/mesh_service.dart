import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../models/peer_model.dart';
import '../models/message_model.dart';
import '../models/group_model.dart';
import 'crypto_engine.dart';
import 'local_mesh_transport.dart';

class MeshService extends ChangeNotifier {
  static final MeshService _instance = MeshService._internal();
  factory MeshService() => _instance;
  MeshService._internal();

  IO.Socket? _socket;
  final LocalMeshTransport _localTransport = LocalMeshTransport();
  StreamSubscription<LocalPeerEvent>? _localPeerSubscription;
  StreamSubscription<Map<String, dynamic>>? _localPacketSubscription;
  String _serverUrl = 'https://privy-chat.onrender.com';
  String _myId = '';
  String _nickname = 'Agent_${1000 + (DateTime.now().millisecondsSinceEpoch % 9000)}';
  String _avatar = '🕵️';
  String _mode = 'wifi'; // 'wifi', 'ble', 'qr'

  List<PeerModel> _discoveredPeers = [];
  final Map<String, PeerModel> _localPeers = <String, PeerModel>{};
  PeerModel? _activePeer;
  final List<MessageModel> _messages = [];
  final Set<String> _receivedPacketIds = <String>{};
  final Map<String, GroupModel> _groups = <String, GroupModel>{};
  final Map<String, List<MessageModel>> _groupMessages = <String, List<MessageModel>>{};
  final Map<String, List<Map<String, dynamic>>> _pendingGroupMessages = <String, List<Map<String, dynamic>>>{};

  bool _isConnectedToMesh = false;
  bool _isStealth = false;
  bool _isGhostMode = false;
  int _burnTimer = 0;
  Timer? _handshakeTimer;

  // Getters
  String get myId => _myId.isNotEmpty ? _myId : _localTransport.localId;
  String get nickname => _nickname;
  String get avatar => _avatar;
  String get mode => _mode;
  String get serverUrl => _serverUrl;
  bool get isConnectedToMesh => _isConnectedToMesh;
  bool get isStealth => _isStealth;
  bool get isGhostMode => _isGhostMode;
  int get burnTimer => _burnTimer;
  List<PeerModel> get discoveredPeers => List.unmodifiable(_discoveredPeers);
  PeerModel? get activePeer => _activePeer;
  List<MessageModel> get messages => List.unmodifiable(_messages);
  List<GroupModel> get groups => List.unmodifiable(_groups.values);
  List<MessageModel> groupMessages(String groupId) => List.unmodifiable(_groupMessages[groupId] ?? const []);
  bool get hasLocalTransport => _localTransport.hasPeer(_activePeer?.id ?? '');
  bool get isLocalMeshReady => _localTransport.isStarted;

  // Callbacks for live UI events
  Function(String title)? onHandshakeStarted;
  Function(int step, String status)? onHandshakeStepUpdate;
  Function()? onHandshakeCompleted;
  Function()? onIncomingCall;
  Function()? onCallConnected;
  Function()? onCallEnded;
  Function(String message)? onTransportError;
  Function(String message)? onHandshakeFailed;

  /// QR is a real transport, not just a key-exchange screen. It is selected
  /// whenever the active peer was discovered optically or the relay is down.
  bool get shouldUseQrTransport =>
      _activePeer?.mode == 'qr' ||
      ((_socket == null || !_socket!.connected) && !hasLocalTransport);

  void updateProfile({String? nick, String? ava, String? mod, bool? stealth, int? burn}) {
    if (nick != null && nick.trim().isNotEmpty) _nickname = nick.trim();
    if (ava != null) _avatar = ava;
    if (mod != null) _mode = mod;
    if (stealth != null) _isStealth = stealth;
    if (burn != null) _burnTimer = burn;

    if (_socket != null && _socket!.connected) {
      _socket!.emit('nearby_update_profile', {
        'nickname': _nickname,
        'avatar': _avatar,
        'mode': _isStealth ? 'stealth' : _mode,
      });
    }
    notifyListeners();
  }

  void toggleGhostMode() {
    _isGhostMode = !_isGhostMode;
    notifyListeners();
  }

  Future<void> connectToMeshServer(String serverUrl) async {
    _serverUrl = serverUrl;
    try {
      await CryptoEngine().init();
      _startLocalTransports();
      _socket?.disconnect();
      _socket?.dispose();

      _socket = IO.io(
        _serverUrl,
        IO.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .enableAutoConnect()
            .enableReconnection()
            .setReconnectionAttempts(10)
            .setReconnectionDelay(1000)
            .build(),
      );

      _socket!.onConnect((_) {
        _isConnectedToMesh = true;
        _myId = _socket!.id ?? '';
        _registerOnMesh();
        notifyListeners();
      });

      _socket!.on('nearby_registered', (data) {
        if (data is Map && data['id'] != null) {
          _myId = data['id'].toString();
          notifyListeners();
        }
      });

      _socket!.on('nearby_peer_list', (data) {
        if (data is List) {
          final relayPeers = data
              .map((p) => PeerModel.fromJson(Map<String, dynamic>.from(p)))
              .where((p) => p.id != _myId && p.mode != 'stealth')
              .toList();
          _replaceRelayPeers(relayPeers);
          notifyListeners();
        }
      });

      // ── Zero-Knowledge Session Handshake Listeners ──
      _socket!.on('nearby_session_request', (data) async {
        _handshakeTimer?.cancel();
        final senderMap = Map<String, dynamic>.from(data['sender'] ?? {});
        final fromId = data['from']?.toString() ?? senderMap['id']?.toString() ?? '';
        final sender = PeerModel.fromJson({
          ...senderMap,
          'id': fromId,
        });
        _activePeer = sender;

        onHandshakeStarted?.call('Incoming from ${sender.nickname}');
        onHandshakeStepUpdate?.call(1, 'active');

        if (sender.publicKey != null) {
          await CryptoEngine().deriveSharedSessionKey(sender.publicKey!);
        }

        onHandshakeStepUpdate?.call(1, 'done');
        onHandshakeStepUpdate?.call(2, 'done');
        onHandshakeStepUpdate?.call(3, 'done');
        onHandshakeStepUpdate?.call(4, 'done');

        _socket!.emit('nearby_session_accept', {
          'to': fromId,
          'publicKey': CryptoEngine().myPublicKeyJwk,
        });

        Future.delayed(const Duration(milliseconds: 300), () {
          onHandshakeCompleted?.call();
          notifyListeners();
        });
      });

      _socket!.on('nearby_session_accept', (data) async {
        _handshakeTimer?.cancel();
        final senderMap = Map<String, dynamic>.from(data['sender'] ?? {});
        final fromId = data['from']?.toString() ?? senderMap['id']?.toString() ?? '';
        final sender = PeerModel.fromJson({
          ...senderMap,
          'id': fromId,
        });
        _activePeer = sender;

        if (sender.publicKey != null && !CryptoEngine().hasSessionKey) {
          await CryptoEngine().deriveSharedSessionKey(sender.publicKey!);
        }

        onHandshakeStepUpdate?.call(2, 'done');
        onHandshakeStepUpdate?.call(3, 'done');
        onHandshakeStepUpdate?.call(4, 'done');

        Future.delayed(const Duration(milliseconds: 300), () {
          onHandshakeCompleted?.call();
          notifyListeners();
        });
      });

      // ── Encrypted Message Receiver ──
      _socket!.on('nearby_p2p_message', (data) async {
        if (data is Map && data['packet'] != null) {
          final packet = Map<String, dynamic>.from(data['packet']);
          await _handleIncomingPacket(packet);
        }
      });

      // ── Call Relay Listeners ──
      _socket!.on('nearby_call_request', (_) => onIncomingCall?.call());
      _socket!.on('nearby_call_response', (data) {
        if (data is Map && data['accepted'] == true) {
          onCallConnected?.call();
        }
      });
      _socket!.on('nearby_call_end', (_) => onCallEnded?.call());

      _socket!.onDisconnect((_) {
        _isConnectedToMesh = false;
        notifyListeners();
      });

      _socket!.onConnectError((err) {
        debugPrint('Mesh connection error: $err');
      });
    } catch (e) {
      _isConnectedToMesh = false;
      notifyListeners();
      debugPrint('Mesh socket init error: $e');
    }
  }

  void _registerOnMesh() {
    if (_socket == null || !_socket!.connected) return;
    _socket!.emit('nearby_join', {
      'nickname': _nickname,
      'avatar': _avatar,
      'mode': _isStealth ? 'stealth' : _mode,
      'device': 'Mobile App',
      'publicKey': CryptoEngine().myPublicKeyJwk,
    });
  }

  void _startLocalTransports() {
    _localPeerSubscription ??= _localTransport.peerEvents.listen(_onLocalPeerEvent);
    _localPacketSubscription ??= _localTransport.packetEvents.listen((event) async {
      if (event['packet'] is Map) {
        await _handleIncomingPacket(Map<String, dynamic>.from(event['packet']));
      }
    });
    unawaited(_localTransport.start(
      id: _myId.isNotEmpty ? _myId : 'mobile_${DateTime.now().millisecondsSinceEpoch}',
      nickname: _nickname,
      avatar: _avatar,
      publicKey: CryptoEngine().myPublicKeyJwk,
    ));
  }

  void _replaceRelayPeers(List<PeerModel> relayPeers) {
    final merged = <String, PeerModel>{
      for (final peer in relayPeers) peer.id: peer,
      ..._localPeers,
    };
    _discoveredPeers = merged.values.where((p) => p.id != _myId && p.mode != 'stealth').toList();
  }

  void _onLocalPeerEvent(LocalPeerEvent event) {
    if (event.peer.id == _myId || event.peer.id == _localTransport.localId) return;
    _localPeers[event.peer.id] = event.peer;
    _replaceRelayPeers(_discoveredPeers.where((peer) => !_localPeers.containsKey(peer.id)).toList());
    notifyListeners();
    if (event.incoming && event.peer.publicKey != null) {
      unawaited(_acceptIncomingLocalPeer(event.peer));
    }
  }

  Future<void> _acceptIncomingLocalPeer(PeerModel peer) async {
    try {
      _activePeer = peer;
      onHandshakeStarted?.call('Incoming ${peer.mode.toUpperCase()} link from ${peer.nickname}');
      onHandshakeStepUpdate?.call(1, 'active');
      await CryptoEngine().deriveSharedSessionKey(peer.publicKey!);
      if (!CryptoEngine().hasSessionKey) throw StateError('Session key was not derived.');
      onHandshakeStepUpdate?.call(1, 'done');
      onHandshakeStepUpdate?.call(2, 'done');
      onHandshakeStepUpdate?.call(3, 'done');
      onHandshakeStepUpdate?.call(4, 'done');
      onHandshakeCompleted?.call();
      notifyListeners();
    } catch (error) {
      onHandshakeFailed?.call('Incoming local link failed: $error');
    }
  }

  Future<void> connectToPeer(PeerModel peer) async {
    _activePeer = peer;
    onHandshakeStarted?.call('Connecting to ${peer.nickname}');
    onHandshakeStepUpdate?.call(1, 'active');

    if (peer.mode == 'ble') {
      try {
        final resolved = await _localTransport.connectBle(peer);
        if (resolved != null) {
          peer = resolved;
          _activePeer = resolved;
          _localPeers[resolved.id] = resolved;
        }
      } catch (error) {
        onHandshakeFailed?.call('Bluetooth connection failed: $error');
        return;
      }
    } else if (peer.mode == 'wifi' && _localPeers.containsKey(peer.id)) {
      try {
        await _localTransport.connectWifi(peer);
      } catch (error) {
        onHandshakeFailed?.call('Local Wi-Fi connection failed: $error');
        return;
      }
    }

    if (peer.publicKey != null) {
      await CryptoEngine().deriveSharedSessionKey(peer.publicKey!);
    }

    if (!CryptoEngine().hasSessionKey) {
      onTransportError?.call('Unable to establish the encrypted session. Scan the peer QR code again.');
      onHandshakeFailed?.call('Unable to establish the encrypted session. Scan the peer QR code again.');
      return;
    }

    onHandshakeStepUpdate?.call(1, 'done');
    onHandshakeStepUpdate?.call(2, 'active');

    // If QR air-gap or offline peer: complete handshake directly
    if (peer.mode == 'qr' || _localPeers.containsKey(peer.id) || _localTransport.hasPeer(peer.id) || _socket == null || !_socket!.connected) {
      onHandshakeStepUpdate?.call(2, 'done');
      onHandshakeStepUpdate?.call(3, 'done');
      onHandshakeStepUpdate?.call(4, 'done');
      Future.delayed(const Duration(milliseconds: 350), () {
        _handshakeTimer?.cancel();
        onHandshakeCompleted?.call();
        notifyListeners();
      });
      return;
    }

    _socket?.emit('nearby_session_request', {
      'to': peer.id,
      'publicKey': CryptoEngine().myPublicKeyJwk,
    });
    _handshakeTimer?.cancel();
    _handshakeTimer = Timer(const Duration(seconds: 12), () {
      onHandshakeFailed?.call('Peer did not accept the session. Check that both devices are on the same relay or use QR.');
    });
  }

  String _packetAAD(Map<String, dynamic> packet) {
    return [
      packet['type']?.toString() ?? '',
      packet['sender']?.toString() ?? '',
      packet['timestamp']?.toString() ?? '',
      packet['transferId']?.toString() ?? '',
      packet['index']?.toString() ?? '',
      packet['total']?.toString() ?? '',
      packet['burn']?.toString() ?? '',
    ].join('|');
  }

  Future<bool> sendTextMessage(String text) async {
    if (text.trim().isEmpty || _activePeer == null) return false;
    if (!CryptoEngine().hasSessionKey) {
      debugPrint('Message blocked: secure session is not established.');
      onTransportError?.call('Secure session is not established. Complete the QR handshake first.');
      return false;
    }

    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final rawPacket = <String, dynamic>{
      'id': timestamp.toString(),
      'type': 'text',
      'sender': _nickname,
      'avatar': _avatar,
      'timestamp': timestamp,
      'burn': _burnTimer,
    };

    final aad = _packetAAD(rawPacket);
    final encrypted = await CryptoEngine().encrypt(text.trim(), aad);
    rawPacket['payload'] = encrypted;

    final delivered = await _sendTransportPacket(_activePeer!, rawPacket);
    if (!delivered) {
      // The caller must show the packet in the optical transmitter. Do not
      // add a local bubble here because no bytes have reached the peer yet.
      return false;
    }

    final msg = MessageModel(
      id: rawPacket['id'] as String,
      type: MessageType.text,
      sender: _nickname,
      avatar: _avatar,
      text: text.trim(),
      timestamp: DateTime.now(),
      burnSeconds: _burnTimer,
      isSent: true,
    );

    _messages.add(msg);
    _handleSelfDestruct(msg);
    notifyListeners();
    return true;
  }

  Future<bool> _sendTransportPacket(PeerModel peer, Map<String, dynamic> packet) async {
    try {
      if (peer.mode == 'ble' && _localTransport.hasPeer(peer.id)) {
        await _localTransport.sendBle(peer.id, packet);
        return true;
      }
      if (peer.mode == 'wifi' && (_localPeers.containsKey(peer.id) || _localTransport.hasPeer(peer.id))) {
        await _localTransport.sendWifi(peer.id, packet);
        return true;
      }
      if (_socket != null && _socket!.connected && peer.mode != 'qr') {
        _socket!.emit('nearby_p2p_message', {'to': peer.id, 'packet': packet});
        return true;
      }
    } catch (error) {
      debugPrint('Transport send error: $error');
    }
    return false;
  }

  Future<GroupModel?> createGroup(String name, List<PeerModel> peers) async {
    final cleanName = name.trim();
    if (cleanName.isEmpty) return null;
    final preparedMembers = <PeerModel>[];
    for (final candidate in peers) {
      final prepared = await _preparePeer(candidate);
      if (prepared != null) preparedMembers.add(prepared);
    }
    if (peers.isNotEmpty && preparedMembers.isEmpty) {
      onTransportError?.call('Connect to at least one nearby peer before creating a group.');
      return null;
    }
    final group = GroupModel(
      id: 'group_${DateTime.now().millisecondsSinceEpoch}',
      name: cleanName,
      key: base64Url.encode(List<int>.generate(32, (_) => Random.secure().nextInt(256))),
      creator: _nickname,
      members: preparedMembers,
    );
    _groups[group.id] = group;
    _groupMessages[group.id] = <MessageModel>[];
    // The initial invite is sent after the group ID/key exist, with the final
    // membership list included so every member can address the group.
    var deliveredInvite = false;
    for (final peer in preparedMembers) {
      deliveredInvite = await _sendGroupInvite(peer, group: group) || deliveredInvite;
    }
    if (preparedMembers.isNotEmpty && !deliveredInvite) {
      _groups.remove(group.id);
      _groupMessages.remove(group.id);
      onTransportError?.call('The group key could not be delivered. Reconnect a nearby peer and retry.');
      return null;
    }
    notifyListeners();
    return group;
  }

  Future<PeerModel?> _preparePeer(PeerModel candidate) async {
    var peer = candidate;
    try {
      if (peer.mode == 'ble' && !_localTransport.hasPeer(peer.id)) {
        final resolved = await _localTransport.connectBle(peer);
        if (resolved != null) {
          peer = resolved;
          _localPeers[peer.id] = peer;
        }
      } else if (peer.mode == 'wifi' && _localPeers.containsKey(peer.id) && !_localTransport.hasPeer(peer.id)) {
        await _localTransport.connectWifi(peer);
      } else if (peer.mode == 'wifi' && !_localPeers.containsKey(peer.id) && (_socket == null || !_socket!.connected)) {
        return null;
      }
      peer = _localPeers[peer.id] ?? peer;
      if (peer.publicKey == null) return null;
      await CryptoEngine().deriveSharedSessionKey(peer.publicKey!);
      return CryptoEngine().hasSessionKey ? peer : null;
    } catch (error) {
      debugPrint('Group peer preparation failed: $error');
      return null;
    }
  }

  Future<bool> _sendGroupInvite(PeerModel peer, {GroupModel? group}) async {
    if (group == null || peer.publicKey == null) return false;
    await CryptoEngine().deriveSharedSessionKey(peer.publicKey!);
    if (!CryptoEngine().hasSessionKey) return false;
    final rawPacket = <String, dynamic>{
      'id': 'invite_${group.id}_${DateTime.now().millisecondsSinceEpoch}',
      'type': 'group_invite',
      'sender': _nickname,
      'avatar': _avatar,
      'timestamp': DateTime.now().millisecondsSinceEpoch,
      'burn': 0,
    };
    rawPacket['payload'] = await CryptoEngine().encrypt(
      jsonEncode({
        'groupId': group.id,
        'name': group.name,
        'key': group.key,
        'creator': group.creator,
        'members': [
          PeerModel(
            id: _myId.isNotEmpty ? _myId : _localTransport.localId,
            nickname: _nickname,
            avatar: _avatar,
            mode: _mode,
            device: 'Mobile App',
            publicKey: CryptoEngine().myPublicKeyJwk,
          ).toJson(),
          ...group.members.map((member) => member.toJson()),
        ],
      }),
      _packetAAD(rawPacket),
    );
    return _sendTransportPacket(peer, rawPacket);
  }

  Future<bool> sendGroupText(String groupId, String text) async {
    final group = _groups[groupId];
    if (group == null || text.trim().isEmpty) return false;
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final rawPacket = <String, dynamic>{
      'id': 'group_msg_$timestamp',
      'type': 'group_message',
      'groupId': group.id,
      'sender': _nickname,
      'avatar': _avatar,
      'timestamp': timestamp,
    };
    final keyBytes = base64Url.decode(base64Url.normalize(group.key));
    rawPacket['payload'] = await CryptoEngine().encryptWithRawKey(
      keyBytes,
      text.trim(),
      _groupAAD(rawPacket),
    );
    var delivered = false;
    for (final peer in group.members) {
      delivered = await _sendTransportPacket(_localPeers[peer.id] ?? peer, rawPacket) || delivered;
    }
    if (delivered || group.members.isEmpty) {
      final message = MessageModel(
        id: rawPacket['id'] as String,
        type: MessageType.text,
        sender: _nickname,
        avatar: _avatar,
        text: text.trim(),
        timestamp: DateTime.now(),
        isSent: true,
      );
      _groupMessages[group.id]!.add(message);
      notifyListeners();
    }
    return delivered || group.members.isEmpty;
  }

  String _groupAAD(Map<String, dynamic> packet) =>
      '${packet['type'] ?? ''}|${packet['groupId'] ?? ''}|${packet['id'] ?? ''}|${packet['timestamp'] ?? ''}';

  /// Encrypt a text packet for the optical transmitter. The sender's public
  /// key is carried with every packet so the first reply can complete the
  /// reverse side of a QR-only handshake (the original offer is one-way).
  Future<String?> createQrTextPayload(String text) async {
    if (text.trim().isEmpty || _activePeer == null) return null;
    if (text.trim().length > 240) {
      onTransportError?.call('Optical QR messages are limited to 240 characters per frame.');
      return null;
    }
    if (!CryptoEngine().hasSessionKey) {
      onTransportError?.call('Scan the peer offer first; the first QR reply establishes the session.');
      return null;
    }

    await CryptoEngine().init();
    final ownKey = CryptoEngine().myPublicKeyJwk;
    if (ownKey == null) {
      onTransportError?.call('Ephemeral key is not ready. Retry the QR handshake.');
      return null;
    }

    try {
      final timestamp = DateTime.now().millisecondsSinceEpoch;
      final rawPacket = <String, dynamic>{
        'id': timestamp.toString(),
        'type': 'text',
        'sender': _nickname,
        'avatar': _avatar,
        'timestamp': timestamp,
        'burn': _burnTimer,
      };
      rawPacket['payload'] = await CryptoEngine().encrypt(
        text.trim(),
        _packetAAD(rawPacket),
      );

      final localMessage = MessageModel(
        id: rawPacket['id'] as String,
        type: MessageType.text,
        sender: _nickname,
        avatar: _avatar,
        text: text.trim(),
        timestamp: DateTime.now(),
        burnSeconds: _burnTimer,
        isSent: true,
      );
      _messages.add(localMessage);
      _handleSelfDestruct(localMessage);
      notifyListeners();

      return jsonEncode({
      'p': 'privy-opt-v2',
        'type': 'optical_message',
        'id': rawPacket['id'],
        'senderId': _myId,
        'sender': _nickname,
        'avatar': _avatar,
        'mode': 'qr',
        'key': ownKey,
        'packet': rawPacket,
      });
    } catch (error) {
      debugPrint('Optical message encryption error: $error');
      onTransportError?.call('Unable to encrypt this optical message. Retry the transfer.');
      return null;
    }
  }

  /// Accept an optical message frame and route it through the same encrypted
  /// packet handler used by Socket.IO. Returns false for an offer or malformed
  /// barcode so the scanner can safely ignore unrelated QR codes.
  Future<bool> receiveQrPayload(String rawValue) async {
    try {
      final data = jsonDecode(rawValue);
      if (data is! Map ||
          (data['p'] != 'privy-opt-v1' && data['p'] != 'privy-opt-v2') ||
          data['type'] != 'optical_message') {
        return false;
      }
      final message = Map<String, dynamic>.from(data);
      final key = message['key'];
      final senderId = message['senderId']?.toString() ?? 'qr_peer';
      final knownKey = _activePeer?.publicKey;
      final keyChanged = key is Map &&
          (knownKey == null || jsonEncode(knownKey) != jsonEncode(key));
      if (key is Map && (!CryptoEngine().hasSessionKey || keyChanged)) {
        await CryptoEngine().deriveSharedSessionKey(Map<String, dynamic>.from(key));
      }
      if (!CryptoEngine().hasSessionKey) {
        onTransportError?.call('Message received without a valid session key. Scan the peer offer first.');
        return false;
      }

      final packet = Map<String, dynamic>.from(message['packet'] ?? const {});
      if (packet.isEmpty) return false;

      final wasUnpaired = _activePeer == null;
      _activePeer ??= PeerModel(
        id: senderId,
        nickname: message['sender']?.toString() ?? 'QR_Agent',
        avatar: message['avatar']?.toString() ?? '🕵️',
        mode: 'qr',
        publicKey: key is Map ? Map<String, dynamic>.from(key) : null,
      );
      await _handleIncomingPacket(packet);
      if (wasUnpaired) onHandshakeCompleted?.call();
      return true;
    } catch (error) {
      debugPrint('Optical message decode error: $error');
      return false;
    }
  }

  Future<void> _handleIncomingPacket(Map<String, dynamic> packet) async {
    final type = packet['type']?.toString() ?? 'text';
    if (type != 'group_invite' && type != 'group_message') {
      final packetId = packet['id']?.toString();
      if (packetId != null && !_receivedPacketIds.add(packetId)) return;
    }
    if (type != 'group_message' && !CryptoEngine().hasSessionKey && packet['payload'] is Map) {
      // A local BLE peer sends its hello acknowledgement immediately. Give
      // the incoming side a moment to finish deriving the same session key
      // before attempting to authenticate the first packet.
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (!CryptoEngine().hasSessionKey) return;
    }

    if (type == 'group_invite') {
      await _handleGroupInvite(packet);
      return;
    }
    if (type == 'group_message') {
      await _handleGroupMessage(packet);
      return;
    }

    if (type == 'text') {
      final aad = _packetAAD(packet);
      final decryptedText = await CryptoEngine().decrypt(
        Map<String, dynamic>.from(packet['payload'] ?? {}),
        aad,
      );

      final msg = MessageModel(
        id: packet['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
        type: MessageType.text,
        sender: packet['sender']?.toString() ?? 'Peer',
        avatar: packet['avatar']?.toString() ?? '🕵️',
        text: decryptedText,
        timestamp: DateTime.now(),
        burnSeconds: int.tryParse(packet['burn']?.toString() ?? '0') ?? 0,
        isSent: false,
      );

      _messages.add(msg);
      _handleSelfDestruct(msg);
      notifyListeners();
    }
  }

  Future<void> _handleGroupInvite(Map<String, dynamic> packet) async {
    final packetId = packet['id']?.toString();
    if (packetId != null && !_receivedPacketIds.add(packetId)) return;
    final clear = await CryptoEngine().decrypt(
      Map<String, dynamic>.from(packet['payload'] ?? {}),
      _packetAAD(packet),
    );
    try {
      final invite = Map<String, dynamic>.from(jsonDecode(clear));
      final ownId = _myId.isNotEmpty ? _myId : _localTransport.localId;
      final members = invite['members'] is List
          ? (invite['members'] as List)
              .whereType<Map>()
              .map((member) => PeerModel.fromJson(Map<String, dynamic>.from(member)))
              .where((member) => member.id != ownId)
              .toList()
          : <PeerModel>[];
      final group = GroupModel(
        id: invite['groupId'].toString(),
        name: invite['name'].toString(),
        key: invite['key'].toString(),
        creator: invite['creator']?.toString() ?? packet['sender']?.toString() ?? 'Peer',
        members: members,
      );
      _groups[group.id] = group;
      _groupMessages.putIfAbsent(group.id, () => <MessageModel>[]);
      final pending = _pendingGroupMessages.remove(group.id) ?? const <Map<String, dynamic>>[];
      for (final pendingPacket in pending) {
        await _handleGroupMessage(pendingPacket);
      }
      notifyListeners();
    } catch (_) {
      debugPrint('Invalid group invite received.');
    }
  }

  Future<void> _handleGroupMessage(Map<String, dynamic> packet) async {
    final groupId = packet['groupId']?.toString();
    final group = groupId == null ? null : _groups[groupId];
    if (group == null) {
      if (groupId != null) {
        _pendingGroupMessages.putIfAbsent(groupId, () => <Map<String, dynamic>>[]).add(packet);
      }
      return;
    }
    final packetId = packet['id']?.toString();
    if (packetId != null && !_receivedPacketIds.add(packetId)) return;
    final keyBytes = base64Url.decode(base64Url.normalize(group.key));
    final clear = await CryptoEngine().decryptWithRawKey(
      keyBytes,
      Map<String, dynamic>.from(packet['payload'] ?? {}),
      _groupAAD(packet),
    );
    if (clear.startsWith('[Decryption failed')) return;
    final message = MessageModel(
      id: packet['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
      type: MessageType.text,
      sender: packet['sender']?.toString() ?? 'Peer',
      avatar: packet['avatar']?.toString() ?? '🕵️',
      text: clear,
      timestamp: DateTime.now(),
      isSent: false,
    );
    _groupMessages.putIfAbsent(group.id, () => <MessageModel>[]).add(message);
    notifyListeners();
  }

  void _handleSelfDestruct(MessageModel msg) {
    if (msg.burnSeconds > 0) {
      Timer(Duration(seconds: msg.burnSeconds), () {
        msg.isBurned = true;
        _messages.removeWhere((m) => m.id == msg.id);
        notifyListeners();
      });
    }
  }

  void terminateSession() {
    _handshakeTimer?.cancel();
    _handshakeTimer = null;
    _activePeer = null;
    _messages.clear();
    _groups.clear();
    _groupMessages.clear();
    _pendingGroupMessages.clear();
    _receivedPacketIds.clear();
    CryptoEngine().purge();
    notifyListeners();
  }

  void panicPurge() {
    terminateSession();
    _socket?.disconnect();
    _socket = null;
    _discoveredPeers.clear();
    _localPeers.clear();
    _groups.clear();
    _groupMessages.clear();
    _pendingGroupMessages.clear();
    unawaited(_localPeerSubscription?.cancel() ?? Future<void>.value());
    unawaited(_localPacketSubscription?.cancel() ?? Future<void>.value());
    _localPeerSubscription = null;
    _localPacketSubscription = null;
    unawaited(_localTransport.stop());
    _isConnectedToMesh = false;
    notifyListeners();
  }
}

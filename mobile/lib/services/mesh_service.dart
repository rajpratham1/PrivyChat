import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
import '../models/peer_model.dart';
import '../models/message_model.dart';
import 'crypto_engine.dart';

class MeshService extends ChangeNotifier {
  static final MeshService _instance = MeshService._internal();
  factory MeshService() => _instance;
  MeshService._internal();

  IO.Socket? _socket;
  String _serverUrl = 'https://privy-chat.onrender.com';
  String _myId = '';
  String _nickname = 'Agent_${1000 + (DateTime.now().millisecondsSinceEpoch % 9000)}';
  String _avatar = '🕵️';
  String _mode = 'wifi'; // 'wifi', 'ble', 'qr'

  List<PeerModel> _discoveredPeers = [];
  PeerModel? _activePeer;
  final List<MessageModel> _messages = [];

  bool _isConnectedToMesh = false;
  bool _isStealth = false;
  bool _isGhostMode = false;
  int _burnTimer = 0;

  // Getters
  String get myId => _myId;
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

  // Callbacks for live UI events
  Function(String title)? onHandshakeStarted;
  Function(int step, String status)? onHandshakeStepUpdate;
  Function()? onHandshakeCompleted;
  Function()? onIncomingCall;
  Function()? onCallConnected;
  Function()? onCallEnded;

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
    await CryptoEngine().init();

    try {
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
          _discoveredPeers = data
              .map((p) => PeerModel.fromJson(Map<String, dynamic>.from(p)))
              .where((p) => p.id != _myId && p.mode != 'stealth')
              .toList();
          notifyListeners();
        }
      });

      // ── Zero-Knowledge Session Handshake Listeners ──
      _socket!.on('nearby_session_request', (data) async {
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

  Future<void> connectToPeer(PeerModel peer) async {
    _activePeer = peer;
    onHandshakeStarted?.call('Connecting to ${peer.nickname}');
    onHandshakeStepUpdate?.call(1, 'active');

    if (peer.publicKey != null) {
      await CryptoEngine().deriveSharedSessionKey(peer.publicKey!);
    }

    onHandshakeStepUpdate?.call(1, 'done');
    onHandshakeStepUpdate?.call(2, 'active');

    // If QR air-gap or offline peer: complete handshake directly
    if (peer.mode == 'qr' || _socket == null || !_socket!.connected) {
      onHandshakeStepUpdate?.call(2, 'done');
      onHandshakeStepUpdate?.call(3, 'done');
      onHandshakeStepUpdate?.call(4, 'done');
      Future.delayed(const Duration(milliseconds: 350), () {
        onHandshakeCompleted?.call();
        notifyListeners();
      });
      return;
    }

    _socket?.emit('nearby_session_request', {
      'to': peer.id,
      'publicKey': CryptoEngine().myPublicKeyJwk,
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

  Future<void> sendTextMessage(String text) async {
    if (text.trim().isEmpty || _activePeer == null) return;

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

    // Send over socket relay if available
    if (_socket != null && _socket!.connected) {
      _socket!.emit('nearby_p2p_message', {
        'to': _activePeer!.id,
        'packet': rawPacket,
      });
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
  }

  Future<void> _handleIncomingPacket(Map<String, dynamic> packet) async {
    final type = packet['type']?.toString() ?? 'text';

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
    _activePeer = null;
    _messages.clear();
    CryptoEngine().purge();
    notifyListeners();
  }

  void panicPurge() {
    terminateSession();
    _socket?.disconnect();
    _socket = null;
    _discoveredPeers.clear();
    _isConnectedToMesh = false;
    notifyListeners();
  }
}

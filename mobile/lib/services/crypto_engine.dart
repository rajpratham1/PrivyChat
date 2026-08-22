import 'dart:convert';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';
import 'package:crypto/crypto.dart' as crypto_hash;

class CryptoEngine {
  static final CryptoEngine _instance = CryptoEngine._internal();
  factory CryptoEngine() => _instance;
  CryptoEngine._internal();

  final _ecdh = Ecdh.p256(length: 32);
  final _aesGcm = AesGcm.with256bits();

  EcKeyPair? _keyPair;
  Map<String, dynamic>? _myPublicKeyJwk;
  SecretKey? _sharedSessionKey;
  String _safetyFingerprint = '';
  String _safetyEmojis = '';

  Map<String, dynamic>? get myPublicKeyJwk => _myPublicKeyJwk;
  String get safetyFingerprint => _safetyFingerprint;
  String get safetyEmojis => _safetyEmojis;
  bool get hasSessionKey => _sharedSessionKey != null;

  Future<void> init() async {
    _keyPair = await _ecdh.newKeyPair();
    final publicKey = await _keyPair!.extractPublicKey() as EcPublicKey;

    _myPublicKeyJwk = {
      'kty': 'EC',
      'crv': 'P-256',
      'x': base64Url.encode(publicKey.x).replaceAll('=', ''),
      'y': base64Url.encode(publicKey.y).replaceAll('=', ''),
    };
  }

  Future<void> deriveSharedSessionKey(Map<String, dynamic> peerJwk) async {
    try {
      if (_keyPair == null) await init();

      final xBytes = base64Url.decode(base64Url.normalize(peerJwk['x'].toString()));
      final yBytes = base64Url.decode(base64Url.normalize(peerJwk['y'].toString()));

      final remotePk = EcPublicKey(
        x: xBytes,
        y: yBytes,
        type: KeyPairType.p256,
      );

      final sharedSecret = await _ecdh.sharedSecretKey(
        keyPair: _keyPair!,
        remotePublicKey: remotePk,
      );

      final secretBytes = await sharedSecret.extractBytes();
      _sharedSessionKey = await _aesGcm.newSecretKeyFromBytes(secretBytes);

      // SHA-256 Safety Fingerprint + Emoji Authentication
      final combined = [...secretBytes, ...xBytes, ...yBytes];
      final digest = crypto_hash.sha256.convert(combined);
      final hex = digest.toString().toUpperCase();
      _safetyFingerprint = '${hex.substring(0, 4)} ${hex.substring(4, 8)} ${hex.substring(8, 12)} ${hex.substring(12, 16)}';

      final emojiPool = ['🛡️', '⚡', '🔑', '🦅', '🐺', '🦾', '🕵️', '🔒', '🔥', '🕶️', '🚀', '⭐'];
      _safetyEmojis = [0, 1, 2, 3].map((i) => emojiPool[digest.bytes[i] % emojiPool.length]).join(' ');
    } catch (e) {
      print('Key derivation error: $e');
    }
  }

  Future<Map<String, String>> encrypt(String plainText) async {
    final key = _sharedSessionKey ?? await _aesGcm.newSecretKey();
    final nonce = _aesGcm.newNonce();
    final box = await _aesGcm.encrypt(
      utf8.encode(plainText),
      secretKey: key,
      nonce: nonce,
    );
    return {
      'iv': base64.encode(box.nonce),
      'data': base64.encode(box.cipherText + box.mac.bytes),
    };
  }

  Future<String> decrypt(Map<String, dynamic> payload) async {
    if (_sharedSessionKey == null) return '[Encrypted – key negotiating]';
    try {
      final nonceBytes = base64.decode(payload['iv'].toString());
      final raw = base64.decode(payload['data'].toString());
      final cipherText = raw.sublist(0, raw.length - 16);
      final mac = raw.sublist(raw.length - 16);
      final box = SecretBox(cipherText, nonce: nonceBytes, mac: Mac(mac));
      final decrypted = await _aesGcm.decrypt(box, secretKey: _sharedSessionKey!);
      return utf8.decode(decrypted);
    } catch (_) {
      return '[Decryption failed – integrity mismatch]';
    }
  }

  void purge() {
    _sharedSessionKey = null;
    _keyPair = null;
    _myPublicKeyJwk = null;
    _safetyFingerprint = '';
    _safetyEmojis = '';
  }
}

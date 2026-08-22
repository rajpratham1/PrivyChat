import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';
import 'package:crypto/crypto.dart' as crypto_hash;

class CryptoEngine {
  static final CryptoEngine _instance = CryptoEngine._internal();
  factory CryptoEngine() => _instance;
  CryptoEngine._internal();

  final _ecdh = Ecdh.p256(length: 32);
  final _aesGcm = AesGcm.with256bits();

  SimpleKeyPair? _keyPair;
  PublicKey? _publicKey;
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
    _publicKey = await _keyPair!.extractPublicKey();
    final ecPk = _publicKey as EcPublicKey;

    _myPublicKeyJwk = {
      'kty': 'EC',
      'crv': 'P-256',
      'x': base64Url.encode(ecPk.x).replaceAll('=', ''),
      'y': base64Url.encode(ecPk.y).replaceAll('=', ''),
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
        curve: KeyPairType.p256,
      );

      final sharedSecret = await _ecdh.sharedSecretKey(
        keyPair: _keyPair!,
        remotePublicKey: remotePk,
      );

      final secretBytes = await sharedSecret.extractBytes();
      _sharedSessionKey = await _aesGcm.newSecretKeyFromBytes(secretBytes);

      // Generate SHA-256 Safety Fingerprint & Emojis
      final combined = [...secretBytes, ...xBytes, ...yBytes];
      final digest = crypto_hash.sha256.convert(combined);
      final hex = digest.toString().toUpperCase();

      _safetyFingerprint = '${hex.substring(0, 4)} ${hex.substring(4, 8)} ${hex.substring(8, 12)} ${hex.substring(12, 16)}';

      final emojiPool = ['🛡️', '⚡', '🔑', '🦅', '🐺', '🦾', '🕵️', '🔒', '🔥', '🕶️', '🚀', '⭐'];
      final e1 = emojiPool[digest.bytes[0] % emojiPool.length];
      final e2 = emojiPool[digest.bytes[1] % emojiPool.length];
      final e3 = emojiPool[digest.bytes[2] % emojiPool.length];
      final e4 = emojiPool[digest.bytes[3] % emojiPool.length];
      _safetyEmojis = '$e1 $e2 $e3 $e4';
    } catch (e) {
      print('Key derivation error: $e');
    }
  }

  Future<Map<String, String>> encrypt(String plainText) async {
    if (_sharedSessionKey == null) {
      // Fallback symmetric key if no handshake yet
      final randomKey = await _aesGcm.newSecretKey();
      final box = await _aesGcm.encrypt(utf8.encode(plainText), secretKey: randomKey);
      return {
        'iv': base64.encode(box.nonce),
        'data': base64.encode(box.cipherText + box.mac.bytes),
      };
    }

    final nonce = _aesGcm.newNonce();
    final box = await _aesGcm.encrypt(
      utf8.encode(plainText),
      secretKey: _sharedSessionKey!,
      nonce: nonce,
    );

    return {
      'iv': base64.encode(box.nonce),
      'data': base64.encode(box.cipherText + box.mac.bytes),
    };
  }

  Future<String> decrypt(Map<String, dynamic> encryptedPayload) async {
    if (_sharedSessionKey == null) return '[Encrypted Payload - Key Negotiating]';

    try {
      final nonceBytes = base64.decode(encryptedPayload['iv'].toString());
      final rawData = base64.decode(encryptedPayload['data'].toString());

      // Last 16 bytes is GCM tag/mac
      final cipherText = rawData.sublist(0, rawData.length - 16);
      final macBytes = rawData.sublist(rawData.length - 16);

      final box = SecretBox(
        cipherText,
        nonce: nonceBytes,
        mac: Mac(macBytes),
      );

      final decryptedBytes = await _aesGcm.decrypt(
        box,
        secretKey: _sharedSessionKey!,
      );

      return utf8.decode(decryptedBytes);
    } catch (e) {
      return '[Decryption failed: Integrity Mismatch]';
    }
  }

  void purge() {
    _sharedSessionKey = null;
    _keyPair = null;
    _publicKey = null;
    _myPublicKeyJwk = null;
    _safetyFingerprint = '';
    _safetyEmojis = '';
  }
}

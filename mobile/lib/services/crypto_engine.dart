import 'dart:convert';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';
import 'package:crypto/crypto.dart' as crypto_hash;

class CryptoEngine {
  static final CryptoEngine _instance = CryptoEngine._internal();
  factory CryptoEngine() => _instance;
  CryptoEngine._internal();

  // P-256 is not implemented by the pure-Dart backend used on Android and
  // throws UnimplementedError at runtime. X25519 is the Curve25519 exchange
  // used by BitChat-style protocols and has a working pure-Dart backend.
  final _ecdh = X25519();
  final _aesGcm = AesGcm.with256bits();

  SimpleKeyPair? _keyPair;
  Map<String, dynamic>? _myPublicKeyJwk;
  SecretKey? _sharedSessionKey;
  String _safetyFingerprint = '';
  String _safetyEmojis = '';
  Future<void>? _initializing;
  int _identityGeneration = 0;

  Map<String, dynamic>? get myPublicKeyJwk => _myPublicKeyJwk;
  String get safetyFingerprint => _safetyFingerprint;
  String get safetyEmojis => _safetyEmojis;
  bool get hasSessionKey => _sharedSessionKey != null;

  Future<void> init() async {
    // Keep one ephemeral identity for the entire app session. Re-generating
    // this key while the QR dialog or socket reconnect is opening makes the
    // already-rendered public key unusable for the peer.
    if (_keyPair != null && _myPublicKeyJwk != null) return;
    if (_initializing != null) {
      await _initializing!;
      return;
    }

    final generation = _identityGeneration;
    final future = _initializeKeyPair(generation);
    _initializing = future;
    try {
      await future;
    } finally {
      if (identical(_initializing, future)) _initializing = null;
    }
  }

  Future<void> _initializeKeyPair(int generation) async {
    final keyPair = await _ecdh.newKeyPair();
    final publicKey = await keyPair.extractPublicKey() as SimplePublicKey;

    if (generation != _identityGeneration) return;
    _keyPair = keyPair;
    _myPublicKeyJwk = {
      'kty': 'OKP',
      'crv': 'X25519',
      'x': base64Url.encode(publicKey.bytes).replaceAll('=', ''),
    };
  }

  String _canonicalPublicKey(Map<String, dynamic> jwk) {
    return jsonEncode({
      'crv': jwk['crv']?.toString() ?? 'X25519',
      'kty': jwk['kty']?.toString() ?? 'OKP',
      'x': jwk['x']?.toString() ?? '',
    });
  }

  /// RFC 5869 compliant HKDF-SHA256
  Uint8List _hkdfSha256({
    required List<int> ikm,
    required List<int> salt,
    required List<int> info,
    int length = 32,
  }) {
    // 1. Extract
    final hmacExtract = crypto_hash.Hmac(crypto_hash.sha256, salt.isNotEmpty ? salt : List.filled(32, 0));
    final prk = hmacExtract.convert(ikm).bytes;

    // 2. Expand
    final hmacExpand = crypto_hash.Hmac(crypto_hash.sha256, prk);
    final okm = <int>[];
    var previousT = <int>[];
    var counter = 1;

    while (okm.length < length) {
      final input = [...previousT, ...info, counter];
      previousT = hmacExpand.convert(input).bytes;
      okm.addAll(previousT);
      counter++;
    }

    return Uint8List.fromList(okm.sublist(0, length));
  }

  Future<void> deriveSharedSessionKey(Map<String, dynamic> peerJwk) async {
    // Never let a failed handshake reuse the previous peer's key. This is
    // especially important when a user connects to several nearby peers in
    // succession or creates a group.
    _sharedSessionKey = null;
    try {
      if (_keyPair == null || _myPublicKeyJwk == null) await init();

      final xBytes = base64Url.decode(base64Url.normalize(peerJwk['x'].toString()));
      if (xBytes.length != 32 || peerJwk['crv']?.toString() != 'X25519') {
        throw FormatException('Unsupported peer key. Expected X25519.');
      }

      final remotePk = SimplePublicKey(xBytes, type: KeyPairType.x25519);

      final sharedSecret = await _ecdh.sharedSecretKey(
        keyPair: _keyPair!,
        remotePublicKey: remotePk,
      );
      final rawSecretBytes = await sharedSecret.extractBytes();

      // Compute canonical transcript hash for HKDF salt (identical to Web Crypto API)
      final transcriptList = [
        _canonicalPublicKey(_myPublicKeyJwk!),
        _canonicalPublicKey(peerJwk),
      ]..sort();
      final transcript = transcriptList.join('|');
      final transcriptDigest = crypto_hash.sha256.convert(utf8.encode(transcript));
      final salt = transcriptDigest.bytes;

      // RFC 5869 HKDF Key Derivation to produce 256-bit AES-GCM Key
      final derivedKeyBytes = _hkdfSha256(
        ikm: rawSecretBytes,
        salt: salt,
        info: utf8.encode('PrivyChat Nearby Tactical Mesh v2 X25519'),
        length: 32,
      );
      _sharedSessionKey = await _aesGcm.newSecretKeyFromBytes(derivedKeyBytes);

      // 16-hex Character Safety Fingerprint
      final hex = transcriptDigest.toString().toUpperCase();
      _safetyFingerprint = '${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}';

      // 4 Safety Emojis from standard 16-symbol tactical table
      final emojiTable = [
        '🛡️', '⚡', '🔑', '🦅', '🐺', '🛰️', '🔒', '💎',
        '🔥', '⚔️', '🌊', '🧬', '👁️', '🦇', '⚓', '🎯',
      ];
      _safetyEmojis = [0, 1, 2, 3]
          .map((i) => emojiTable[salt[i] % emojiTable.length])
          .join(' ');
    } catch (e) {
      _sharedSessionKey = null;
      print('Key derivation error: $e');
    }
  }

  Future<Map<String, String>> encrypt(String plainText, [String additionalData = '']) async {
    final key = _sharedSessionKey;
    if (key == null) {
      throw StateError('Secure session is not established.');
    }
    final nonce = _aesGcm.newNonce();
    final box = await _aesGcm.encrypt(
      utf8.encode(plainText),
      secretKey: key,
      nonce: nonce,
      aad: additionalData.isNotEmpty ? utf8.encode(additionalData) : Uint8List(0),
    );
    return {
      'iv': base64.encode(box.nonce),
      'data': base64.encode(box.cipherText + box.mac.bytes),
    };
  }

  Future<Map<String, String>> encryptWithRawKey(
    List<int> keyBytes,
    String plainText, [
    String additionalData = '',
  ]) async {
    final key = await _aesGcm.newSecretKeyFromBytes(keyBytes);
    final nonce = _aesGcm.newNonce();
    final box = await _aesGcm.encrypt(
      utf8.encode(plainText),
      secretKey: key,
      nonce: nonce,
      aad: additionalData.isNotEmpty ? utf8.encode(additionalData) : Uint8List(0),
    );
    return {
      'iv': base64.encode(box.nonce),
      'data': base64.encode(box.cipherText + box.mac.bytes),
    };
  }

  Future<String> decrypt(Map<String, dynamic> payload, [String additionalData = '']) async {
    if (_sharedSessionKey == null) return '[Encrypted – key negotiating]';
    try {
      final nonceBytes = base64.decode(payload['iv'].toString());
      final raw = base64.decode(payload['data'].toString());
      final cipherText = raw.sublist(0, raw.length - 16);
      final mac = raw.sublist(raw.length - 16);

      // Attempt decryption with Additional Authenticated Data (AAD)
      if (additionalData.isNotEmpty) {
        try {
          final boxWithAad = SecretBox(cipherText, nonce: nonceBytes, mac: Mac(mac));
          final decrypted = await _aesGcm.decrypt(
            boxWithAad,
            secretKey: _sharedSessionKey!,
            aad: utf8.encode(additionalData),
          );
          return utf8.decode(decrypted);
        } catch (_) {
          // Fall through to try without AAD
        }
      }

      final box = SecretBox(cipherText, nonce: nonceBytes, mac: Mac(mac));
      final decrypted = await _aesGcm.decrypt(box, secretKey: _sharedSessionKey!);
      return utf8.decode(decrypted);
    } catch (_) {
      return '[Decryption failed – integrity mismatch]';
    }
  }

  Future<String> decryptWithRawKey(
    List<int> keyBytes,
    Map<String, dynamic> payload, [
    String additionalData = '',
  ]) async {
    try {
      final key = await _aesGcm.newSecretKeyFromBytes(keyBytes);
      final nonceBytes = base64.decode(payload['iv'].toString());
      final raw = base64.decode(payload['data'].toString());
      if (raw.length < 16) return '[Decryption failed – malformed packet]';
      final box = SecretBox(
        raw.sublist(0, raw.length - 16),
        nonce: nonceBytes,
        mac: Mac(raw.sublist(raw.length - 16)),
      );
      final clear = await _aesGcm.decrypt(
        box,
        secretKey: key,
        aad: additionalData.isNotEmpty ? utf8.encode(additionalData) : Uint8List(0),
      );
      return utf8.decode(clear);
    } catch (_) {
      return '[Decryption failed – integrity mismatch]';
    }
  }

  void purge() {
    _identityGeneration++;
    _initializing = null;
    _sharedSessionKey = null;
    _keyPair = null;
    _myPublicKeyJwk = null;
    _safetyFingerprint = '';
    _safetyEmojis = '';
  }
}

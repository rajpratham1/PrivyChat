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

  String _canonicalPublicKey(Map<String, dynamic> jwk) {
    return jsonEncode({
      'crv': jwk['crv']?.toString() ?? 'P-256',
      'kty': jwk['kty']?.toString() ?? 'EC',
      'x': jwk['x']?.toString() ?? '',
      'y': jwk['y']?.toString() ?? '',
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
    try {
      if (_keyPair == null || _myPublicKeyJwk == null) await init();

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
        info: utf8.encode('PrivyChat Nearby Tactical Mesh v1'),
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
      // Fallback direct shared secret if HKDF or format fails
      try {
        if (_keyPair == null) await init();
        final xBytes = base64Url.decode(base64Url.normalize(peerJwk['x'].toString()));
        final yBytes = base64Url.decode(base64Url.normalize(peerJwk['y'].toString()));
        final remotePk = EcPublicKey(x: xBytes, y: yBytes, type: KeyPairType.p256);
        final sharedSecret = await _ecdh.sharedSecretKey(keyPair: _keyPair!, remotePublicKey: remotePk);
        final secretBytes = await sharedSecret.extractBytes();
        _sharedSessionKey = await _aesGcm.newSecretKeyFromBytes(secretBytes);
        final digest = crypto_hash.sha256.convert([...secretBytes, ...xBytes, ...yBytes]);
        final hex = digest.toString().toUpperCase();
        _safetyFingerprint = '${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}';
        final emojiPool = ['🛡️', '⚡', '🔑', '🦅', '🐺', '🦾', '🕵️', '🔒', '🔥', '🕶️', '🚀', '⭐'];
        _safetyEmojis = [0, 1, 2, 3].map((i) => emojiPool[digest.bytes[i] % emojiPool.length]).join(' ');
      } catch (err) {
        print('Key derivation fallback error: $err');
      }
    }
  }

  Future<Map<String, String>> encrypt(String plainText, [String additionalData = '']) async {
    final key = _sharedSessionKey ?? await _aesGcm.newSecretKey();
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

  void purge() {
    _sharedSessionKey = null;
    _keyPair = null;
    _myPublicKeyJwk = null;
    _safetyFingerprint = '';
    _safetyEmojis = '';
  }
}

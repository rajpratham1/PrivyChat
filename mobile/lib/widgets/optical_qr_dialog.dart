import 'dart:convert';
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../services/crypto_engine.dart';
import '../services/mesh_service.dart';
import '../models/peer_model.dart';

class OpticalQrDialog extends StatefulWidget {
  final Function(PeerModel) onQrPeerDecoded;
  final String? outboundPayload;
  final Future<void> Function(String rawValue)? onQrMessageDecoded;

  const OpticalQrDialog({
    super.key,
    required this.onQrPeerDecoded,
    this.outboundPayload,
    this.onQrMessageDecoded,
  });

  @override
  State<OpticalQrDialog> createState() => _OpticalQrDialogState();
}

class _OpticalQrDialogState extends State<OpticalQrDialog> {
  bool _isScanning = false;
  bool _isKeyReady = false;
  bool _peerHandled = false;
  String? _keyError;
  String _qrPayload = '';

  @override
  void initState() {
    super.initState();
    _preparePayload();
  }

  Future<void> _preparePayload() async {
    try {
      if (widget.outboundPayload != null) {
        if (!mounted) return;
        setState(() {
          _qrPayload = widget.outboundPayload!;
          _isKeyReady = true;
          _keyError = null;
        });
        return;
      }
      final crypto = CryptoEngine();
      await crypto.init();
      final jwk = crypto.myPublicKeyJwk;
      if (jwk == null) throw StateError('Ephemeral public key was not generated.');

      final mesh = MeshService();
      final payload = {
        'p': 'privy-opt-v1',
        'type': 'optical_offer',
        'id': mesh.myId.isNotEmpty ? mesh.myId : 'peer_${DateTime.now().millisecondsSinceEpoch}',
        'nick': mesh.nickname,
        'avatar': mesh.avatar,
        'mode': 'qr',
        'key': jwk,
      };
      if (!mounted) return;
      setState(() {
        _qrPayload = jsonEncode(payload);
        _isKeyReady = true;
        _keyError = null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _keyError = 'Unable to initialize E2EE key: $error');
    }
  }

  void _retryPayload() {
    setState(() {
      _isKeyReady = false;
      _keyError = null;
    });
    _preparePayload();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_peerHandled) return;
    for (final barcode in capture.barcodes) {
      if (barcode.rawValue != null) {
        try {
          final data = jsonDecode(barcode.rawValue!);
          if (data is Map &&
              data['p'] == 'privy-opt-v1' &&
              data['type'] == 'optical_message' &&
              widget.onQrMessageDecoded != null) {
            _peerHandled = true;
            final rawValue = barcode.rawValue!;
            Navigator.of(context).pop();
            unawaited(widget.onQrMessageDecoded!(rawValue));
            return;
          }
          if ((data['p'] == 'privy-opt-v1' || data['p'] == 'privychat-opt-v1') && data['key'] != null) {
            final peer = PeerModel(
              id: data['id']?.toString() ?? 'qr_peer',
              nickname: data['nick']?.toString() ?? 'QR_Agent',
              avatar: data['avatar']?.toString() ?? '🕵️',
              mode: 'qr',
              publicKey: Map<String, dynamic>.from(data['key']),
            );
            _peerHandled = true;
            Navigator.of(context).pop();
            widget.onQrPeerDecoded(peer);
            break;
          }
        } catch (e) {
          // Ignore non-json barcodes
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF071A10),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.4)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(LucideIcons.qrCode, color: Color(0xFF22C55E), size: 18),
                    const SizedBox(width: 8),
                    Text(
                      widget.outboundPayload == null
                          ? '100% AIR-GAP QR MESH'
                          : 'OPTICAL MESSAGE TRANSFER',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        fontFamily: 'Courier',
                        color: Color(0xFF22C55E),
                      ),
                    ),
                  ],
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(LucideIcons.x, color: Colors.white70, size: 18),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Tab Buttons (Show My QR vs Scan Camera)
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => setState(() => _isScanning = false),
                    icon: const Icon(LucideIcons.qrCode, size: 14),
                    label: Text(widget.outboundPayload == null ? 'Show My Code' : 'Show Message QR', style: const TextStyle(fontSize: 11)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: !_isScanning ? const Color(0xFF22C55E) : const Color(0xFF1E293B),
                      foregroundColor: !_isScanning ? Colors.black : Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: () => setState(() => _isScanning = true),
                    icon: const Icon(LucideIcons.camera, size: 14),
                    label: const Text('Scan Camera', style: TextStyle(fontSize: 11)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: _isScanning ? const Color(0xFF22C55E) : const Color(0xFF1E293B),
                      foregroundColor: _isScanning ? Colors.black : Colors.white,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),

            // Viewport
            if (!_isScanning) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: _isKeyReady
                    ? QrImageView(
                        data: _qrPayload,
                        version: QrVersions.auto,
                        size: 200,
                      )
                    : SizedBox(
                        width: 200,
                        height: 200,
                        child: Center(
                          child: _keyError == null
                              ? const CircularProgressIndicator(color: Color(0xFF22C55E))
                              : IconButton(
                                  onPressed: _retryPayload,
                                  icon: const Icon(LucideIcons.refreshCcw, color: Color(0xFFEF4444), size: 28),
                                  tooltip: 'Retry key generation',
                                ),
                        ),
                      ),
              ),
              const SizedBox(height: 12),
              Text(
                _keyError ?? (widget.outboundPayload == null
                    ? 'Let peer scan your screen with their camera to establish an air-gapped E2EE session with zero network.'
                    : 'Let the peer scan this message frame. Then switch to Scan Camera to receive their reply.'),
                style: TextStyle(fontSize: 11, color: _keyError == null ? const Color(0xFF94A3B8) : const Color(0xFFEF4444)),
                textAlign: TextAlign.center,
              ),
            ] else ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  height: 220,
                  width: double.infinity,
                  child: MobileScanner(
                    onDetect: _onDetect,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Point camera at peer\'s screen to complete optical cryptographic handshake.',
                style: TextStyle(fontSize: 11, color: Color(0xFF22C55E)),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

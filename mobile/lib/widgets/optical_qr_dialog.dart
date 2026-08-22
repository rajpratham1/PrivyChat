import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../services/crypto_engine.dart';
import '../services/mesh_service.dart';
import '../models/peer_model.dart';

class OpticalQrDialog extends StatefulWidget {
  final Function(PeerModel) onQrPeerDecoded;

  const OpticalQrDialog({
    super.key,
    required this.onQrPeerDecoded,
  });

  @override
  State<OpticalQrDialog> createState() => _OpticalQrDialogState();
}

class _OpticalQrDialogState extends State<OpticalQrDialog> {
  bool _isScanning = false;
  String _qrPayload = '';

  @override
  void initState() {
    super.initState();
    _generatePayload();
  }

  void _generatePayload() {
    final mesh = MeshService();
    final jwk = CryptoEngine().myPublicKeyJwk;
    final payload = {
      'p': 'privychat-opt-v1',
      'id': mesh.myId.isNotEmpty ? mesh.myId : 'peer_${DateTime.now().millisecondsSinceEpoch}',
      'nick': mesh.nickname,
      'avatar': mesh.avatar,
      'mode': 'qr',
      'key': jwk,
    };
    setState(() {
      _qrPayload = jsonEncode(payload);
    });
  }

  void _onDetect(BarcodeCapture capture) {
    for (final barcode in capture.barcodes) {
      if (barcode.rawValue != null) {
        try {
          final data = jsonDecode(barcode.rawValue!);
          if (data['p'] == 'privychat-opt-v1' && data['key'] != null) {
            final peer = PeerModel(
              id: data['id']?.toString() ?? 'qr_peer',
              nickname: data['nick']?.toString() ?? 'QR_Agent',
              avatar: data['avatar']?.toString() ?? '🕵️',
              mode: 'qr',
              publicKey: Map<String, dynamic>.from(data['key']),
            );
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
                    const Text(
                      '100% AIR-GAP QR MESH',
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
                    label: const Text('Show My Code', style: TextStyle(fontSize: 11)),
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
                child: QrImageView(
                  data: _qrPayload,
                  version: QrVersions.auto,
                  size: 200,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'Let peer scan your screen with their camera to establish an air-gapped E2EE session with zero network.',
                style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
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

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class HandshakeDialog extends StatelessWidget {
  final String title;
  final int currentStep; // 1, 2, 3, 4
  final VoidCallback onCancel;

  const HandshakeDialog({
    super.key,
    required this.title,
    required this.currentStep,
    required this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF071A10),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.4)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF22C55E).withOpacity(0.15),
              blurRadius: 24,
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Spinner Icon
            const SizedBox(
              width: 44,
              height: 44,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF22C55E)),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              'ESTABLISHING SECURE MESH',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.0,
                color: Color(0xFF22C55E),
                fontFamily: 'Courier',
              ),
            ),
            const SizedBox(height: 4),
            Text(
              title,
              style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),

            // 4-Step Checklist
            _buildStepRow(1, 'Ephemeral X25519 Key Exchange'),
            _buildStepRow(2, 'Signal Negotiation & Handshake'),
            _buildStepRow(3, 'Zero-Knowledge AES-256-GCM Session Key'),
            _buildStepRow(4, 'Direct Encrypted Channel Active'),

            const SizedBox(height: 20),
            TextButton(
              onPressed: onCancel,
              style: TextButton.styleFrom(
                foregroundColor: const Color(0xFFEF4444),
                backgroundColor: const Color(0xFFEF4444).withOpacity(0.12),
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('Abort Handshake', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepRow(int stepNum, String label) {
    final isDone = currentStep > stepNum;
    final isActive = currentStep == stepNum;

    Color iconColor = const Color(0xFF475569);
    IconData icon = LucideIcons.circle;

    if (isDone) {
      iconColor = const Color(0xFF22C55E);
      icon = LucideIcons.checkCircle2;
    } else if (isActive) {
      iconColor = const Color(0xFF06B6D4);
      icon = LucideIcons.loader2;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 14, color: iconColor),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: isDone || isActive ? const Color(0xFFF1F5F9) : const Color(0xFF64748B),
                fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

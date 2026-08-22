import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/peer_model.dart';

class RadarCanvasWidget extends StatefulWidget {
  final List<PeerModel> peers;
  final Function(PeerModel)? onPeerSelected;

  const RadarCanvasWidget({
    super.key,
    required this.peers,
    this.onPeerSelected,
  });

  @override
  State<RadarCanvasWidget> createState() => _RadarCanvasWidgetState();
}

class _RadarCanvasWidgetState extends State<RadarCanvasWidget> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1.0,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return CustomPaint(
            painter: RadarPainter(
              angle: _controller.value * 2 * math.pi,
              peers: widget.peers,
            ),
          );
        },
      ),
    );
  }
}

class RadarPainter extends CustomPainter {
  final double angle;
  final List<PeerModel> peers;

  RadarPainter({
    required this.angle,
    required this.peers,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 12;

    // Background circle
    final bgPaint = Paint()
      ..color = const Color(0xFF071A10).withOpacity(0.85)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, radius, bgPaint);

    // Concentric Range Rings
    final ringPaint = Paint()
      ..color = const Color(0xFF22C55E).withOpacity(0.22)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    for (final ratio in [0.25, 0.5, 0.75, 1.0]) {
      canvas.drawCircle(center, radius * ratio, ringPaint);
    }

    // Crosshairs
    final crossPaint = Paint()
      ..color = const Color(0xFF22C55E).withOpacity(0.18)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    canvas.drawLine(Offset(center.dx, 12), Offset(center.dx, size.height - 12), crossPaint);
    canvas.drawLine(Offset(12, center.dy), Offset(size.width - 12, center.dy), crossPaint);

    // Sweeping Radar Arc Beam
    final sweepRect = Rect.fromCircle(center: center, radius: radius);
    final sweepGradient = SweepGradient(
      center: Alignment.center,
      startAngle: angle - 0.6,
      endAngle: angle,
      colors: [
        Colors.transparent,
        const Color(0xFF22C55E).withOpacity(0.05),
        const Color(0xFF22C55E).withOpacity(0.40),
      ],
      stops: const [0.0, 0.5, 1.0],
      transform: GradientRotation(0),
    );

    final beamPaint = Paint()
      ..shader = sweepGradient.createShader(sweepRect)
      ..style = PaintingStyle.fill;

    canvas.drawArc(sweepRect, angle - 0.6, 0.6, true, beamPaint);

    // Leading Sweep Line
    final linePaint = Paint()
      ..color = const Color(0xFF4ADE80)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8;

    final lineEnd = Offset(
      center.dx + radius * math.cos(angle),
      center.dy + radius * math.sin(angle),
    );
    canvas.drawLine(center, lineEnd, linePaint);

    // Render Blips
    for (int i = 0; i < peers.length; i++) {
      final peer = peers[i];
      int hash = 0;
      for (int j = 0; j < peer.id.length; j++) {
        hash = (hash << 5) - hash + peer.id.codeUnitAt(j);
      }
      final blipAngle = (hash.abs() % 360) * (math.pi / 180);
      final blipDist = 45.0 + (hash.abs() % (radius.toInt() - 60));

      final blipCenter = Offset(
        center.dx + blipDist * math.cos(blipAngle),
        center.dy + blipDist * math.sin(blipAngle),
      );

      final isBle = peer.mode == 'ble';
      final blipColor = isBle ? const Color(0xFF06B6D4) : const Color(0xFF22C55E);

      // Pulsing Halo
      final haloPaint = Paint()
        ..color = blipColor.withOpacity(0.25)
        ..style = PaintingStyle.fill;
      canvas.drawCircle(blipCenter, 9.0, haloPaint);

      // Core Dot
      final dotPaint = Paint()
        ..color = blipColor
        ..style = PaintingStyle.fill;
      canvas.drawCircle(blipCenter, 4.5, dotPaint);

      // Nickname text
      final textSpan = TextSpan(
        text: peer.nickname,
        style: const TextStyle(
          color: Color(0xFFF0FDF4),
          fontSize: 9.5,
          fontFamily: 'Courier',
          fontWeight: FontWeight.bold,
        ),
      );
      final textPainter = TextPainter(
        text: textSpan,
        textDirection: TextDirection.ltr,
      )..layout();

      textPainter.paint(canvas, Offset(blipCenter.dx + 8, blipCenter.dy - 6));
    }
  }

  @override
  bool shouldRepaint(covariant RadarPainter oldDelegate) => true;
}

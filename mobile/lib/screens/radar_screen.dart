import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../services/mesh_service.dart';
import '../models/peer_model.dart';
import '../widgets/radar_canvas.dart';
import '../widgets/discovery_tabs.dart';
import '../widgets/optical_qr_dialog.dart';
import 'chat_hud_screen.dart';
import 'identity_screen.dart';

class RadarScreen extends StatefulWidget {
  const RadarScreen({super.key});

  @override
  State<RadarScreen> createState() => _RadarScreenState();
}

class _RadarScreenState extends State<RadarScreen> {
  bool _handshakeDialogOpen = false;
  String _handshakeTitle = '';
  int _handshakeStep = 0;

  @override
  void initState() {
    super.initState();
    final mesh = MeshService();
    mesh.addListener(_onMeshUpdated);

    mesh.onHandshakeStarted = (title) {
      if (!mounted) return;
      setState(() {
        _handshakeTitle = title;
        _handshakeStep = 1;
        _handshakeDialogOpen = true;
      });
      _showHandshakeDialog();
    };

    mesh.onHandshakeStepUpdate = (step, status) {
      if (!mounted) return;
      setState(() => _handshakeStep = step);
    };

    mesh.onHandshakeCompleted = () {
      if (!mounted) return;
      if (_handshakeDialogOpen) {
        Navigator.of(context, rootNavigator: true).pop();
        _handshakeDialogOpen = false;
      }
      final peer = MeshService().activePeer;
      if (peer != null) {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ChatHudScreen(peer: peer)),
        );
      }
    };
  }

  @override
  void dispose() {
    MeshService().removeListener(_onMeshUpdated);
    super.dispose();
  }

  void _onMeshUpdated() {
    if (mounted) setState(() {});
  }

  void _showHandshakeDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => _HandshakeDialogStateful(
        title: _handshakeTitle,
        getStep: () => _handshakeStep,
        onCancel: () {
          Navigator.of(ctx).pop();
          _handshakeDialogOpen = false;
          MeshService().terminateSession();
        },
      ),
    );
  }

  void _openOpticalQrDialog() {
    showDialog(
      context: context,
      builder: (ctx) => OpticalQrDialog(
        onQrPeerDecoded: (peer) {
          MeshService().connectToPeer(peer);
        },
      ),
    );
  }

  void _showProfileEditor() {
    final mesh = MeshService();
    final nickCtrl = TextEditingController(text: mesh.nickname);
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF071A10),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Edit Profile', style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 16),
            TextField(
              controller: nickCtrl,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: 'Callsign',
                hintStyle: const TextStyle(color: Color(0xFF64748B)),
                filled: true,
                fillColor: const Color(0xFF0D1B1E),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: () {
                  final n = nickCtrl.text.trim();
                  if (n.isNotEmpty) mesh.updateProfile(nick: n);
                  Navigator.of(ctx).pop();
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF22C55E),
                  foregroundColor: Colors.black,
                ),
                child: const Text('Save'),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                MeshService().panicPurge();
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const IdentityScreen()),
                );
              },
              child: const Text('← Back to Identity Setup', style: TextStyle(color: Color(0xFF64748B), fontSize: 12)),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mesh = MeshService();

    return Scaffold(
      backgroundColor: const Color(0xFF030712),
      appBar: AppBar(
        backgroundColor: const Color(0xFF071A10),
        elevation: 0,
        leading: GestureDetector(
          onTap: _showProfileEditor,
          child: Container(
            margin: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: Colors.white.withOpacity(0.06),
            ),
            child: Center(
              child: Text(mesh.avatar, style: const TextStyle(fontSize: 18)),
            ),
          ),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'NEARBY MESH',
              style: TextStyle(
                fontFamily: 'Courier',
                fontWeight: FontWeight.bold,
                fontSize: 14,
                color: Color(0xFF22C55E),
                letterSpacing: 1.2,
              ),
            ),
            Text(
              mesh.nickname,
              style: const TextStyle(fontSize: 10, color: Color(0xFF64748B), fontFamily: 'Courier'),
            ),
          ],
        ),
        actions: [
          // Stealth Toggle
          IconButton(
            icon: Icon(
              mesh.isStealth ? LucideIcons.eyeOff : LucideIcons.eye,
              color: mesh.isStealth ? const Color(0xFFA855F7) : const Color(0xFF64748B),
              size: 18,
            ),
            tooltip: mesh.isStealth ? 'Stealth ON' : 'Go Stealth',
            onPressed: () => mesh.updateProfile(stealth: !mesh.isStealth),
          ),
          // Connection status badge
          Container(
            margin: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: mesh.isConnectedToMesh
                  ? const Color(0xFF22C55E).withOpacity(0.15)
                  : const Color(0xFFEF4444).withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: mesh.isConnectedToMesh ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                width: 0.8,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(
                    color: mesh.isConnectedToMesh ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 4),
                Text(
                  mesh.isConnectedToMesh ? 'LIVE' : 'OFF',
                  style: TextStyle(
                    fontSize: 9,
                    fontFamily: 'Courier',
                    fontWeight: FontWeight.bold,
                    color: mesh.isConnectedToMesh ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            // Info banner
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    const Color(0xFF06B6D4).withOpacity(0.10),
                    const Color(0xFF22C55E).withOpacity(0.10),
                  ],
                ),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF06B6D4).withOpacity(0.3)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF06B6D4).withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF06B6D4)),
                    ),
                    child: const Text('● Native Beta', style: TextStyle(color: Color(0xFF06B6D4), fontSize: 9, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'WiFi • BLE • Air-Gap QR — Zero-knowledge encryption active',
                      style: TextStyle(fontSize: 10.5, color: Color(0xFFE2E8F0)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Radar
            SizedBox(
              height: 260,
              child: RadarCanvasWidget(
                peers: mesh.discoveredPeers,
                onPeerSelected: (peer) => _confirmConnect(peer),
              ),
            ),
            const SizedBox(height: 14),

            // Mode Tabs
            DiscoveryTabs(
              activeMode: mesh.mode,
              onModeChanged: (newMode) {
                mesh.updateProfile(mod: newMode);
                if (newMode == 'qr') _openOpticalQrDialog();
              },
            ),
            const SizedBox(height: 18),

            // Peers header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'DISCOVERED PEERS',
                  style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.bold, fontFamily: 'Courier', color: Color(0xFF94A3B8)),
                ),
                Text(
                  '${mesh.discoveredPeers.length} in range',
                  style: const TextStyle(fontSize: 10.5, color: Color(0xFF22C55E), fontFamily: 'Courier'),
                ),
              ],
            ),
            const SizedBox(height: 10),

            if (mesh.discoveredPeers.isEmpty)
              Container(
                padding: const EdgeInsets.all(28),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFF071A10),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.15)),
                ),
                child: Column(
                  children: [
                    const Icon(LucideIcons.radio, color: Color(0xFF22C55E), size: 26),
                    const SizedBox(height: 10),
                    const Text(
                      'Scanning for nearby peers...',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      mesh.isConnectedToMesh
                          ? 'Ask your peer to open PrivyChat on same WiFi network.'
                          : 'Not connected to mesh server. Check your network.',
                      style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B)),
                      textAlign: TextAlign.center,
                    ),
                    if (!mesh.isConnectedToMesh) ...[
                      const SizedBox(height: 12),
                      ElevatedButton.icon(
                        onPressed: () {
                          Navigator.of(context).pushReplacement(
                            MaterialPageRoute(builder: (_) => const IdentityScreen()),
                          );
                        },
                        icon: const Icon(LucideIcons.refreshCcw, size: 14),
                        label: const Text('Reconnect', style: TextStyle(fontSize: 12)),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF22C55E),
                          foregroundColor: Colors.black,
                        ),
                      ),
                    ],
                  ],
                ),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: mesh.discoveredPeers.length,
                itemBuilder: (context, index) {
                  return _buildPeerCard(mesh.discoveredPeers[index]);
                },
              ),

            const SizedBox(height: 20),

            // Air-Gap QR Quick-Connect
            OutlinedButton.icon(
              onPressed: _openOpticalQrDialog,
              icon: const Icon(LucideIcons.qrCode, size: 15, color: Color(0xFF06B6D4)),
              label: const Text(
                'AIR-GAP QR MESH (No WiFi needed)',
                style: TextStyle(fontSize: 11, color: Color(0xFF06B6D4), letterSpacing: 0.5),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: Color(0xFF06B6D4), width: 0.8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmConnect(PeerModel peer) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF071A10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: Row(
          children: [
            Text(peer.avatar, style: const TextStyle(fontSize: 22)),
            const SizedBox(width: 10),
            Text(peer.nickname, style: const TextStyle(fontSize: 15, color: Colors.white)),
          ],
        ),
        content: Text(
          'Initiate encrypted E2EE session with ${peer.nickname}?\nA ECDH P-256 handshake will be performed.',
          style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF64748B))),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              MeshService().connectToPeer(peer);
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF22C55E), foregroundColor: Colors.black),
            child: const Text('Connect', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildPeerCard(PeerModel peer) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF071A10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.07),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(peer.avatar, style: const TextStyle(fontSize: 20)),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  peer.nickname,
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                Row(
                  children: [
                    Icon(
                      peer.mode == 'ble' ? LucideIcons.bluetooth : LucideIcons.wifi,
                      size: 10,
                      color: const Color(0xFF64748B),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      peer.mode == 'ble' ? 'Bluetooth BLE' : 'Local WiFi',
                      style: const TextStyle(fontSize: 10, color: Color(0xFF64748B), fontFamily: 'Courier'),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      peer.device,
                      style: const TextStyle(fontSize: 10, color: Color(0xFF475569), fontFamily: 'Courier'),
                    ),
                  ],
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: () => _confirmConnect(peer),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF22C55E),
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: const Text('Connect', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

// Stateful wrapper so handshake dialog reflects live step updates
class _HandshakeDialogStateful extends StatefulWidget {
  final String title;
  final int Function() getStep;
  final VoidCallback onCancel;

  const _HandshakeDialogStateful({
    required this.title,
    required this.getStep,
    required this.onCancel,
  });

  @override
  State<_HandshakeDialogStateful> createState() => _HandshakeDialogStatefulState();
}

class _HandshakeDialogStatefulState extends State<_HandshakeDialogStateful> {
  @override
  void initState() {
    super.initState();
    MeshService().addListener(_update);
  }

  @override
  void dispose() {
    MeshService().removeListener(_update);
    super.dispose();
  }

  void _update() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final step = widget.getStep();
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: const Color(0xFF071A10),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.4)),
          boxShadow: [BoxShadow(color: const Color(0xFF22C55E).withOpacity(0.15), blurRadius: 24)],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(
              width: 44, height: 44,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF22C55E)),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'ESTABLISHING SECURE MESH',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, letterSpacing: 1.0, color: Color(0xFF22C55E), fontFamily: 'Courier'),
            ),
            const SizedBox(height: 4),
            Text(widget.title, style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)), textAlign: TextAlign.center),
            const SizedBox(height: 20),
            _stepRow(step, 1, 'ECDH P-256 Key Exchange'),
            _stepRow(step, 2, 'Signal Negotiation & Handshake'),
            _stepRow(step, 3, 'AES-256-GCM Session Key Derived'),
            _stepRow(step, 4, 'Encrypted Channel Active'),
            const SizedBox(height: 20),
            TextButton(
              onPressed: widget.onCancel,
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

  Widget _stepRow(int current, int stepNum, String label) {
    final isDone = current > stepNum;
    final isActive = current == stepNum;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(
            isDone ? Icons.check_circle : (isActive ? Icons.radio_button_checked : Icons.radio_button_unchecked),
            size: 14,
            color: isDone ? const Color(0xFF22C55E) : (isActive ? const Color(0xFF06B6D4) : const Color(0xFF475569)),
          ),
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

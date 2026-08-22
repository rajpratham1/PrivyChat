import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../services/mesh_service.dart';
import '../models/peer_model.dart';
import '../widgets/radar_canvas.dart';
import '../widgets/discovery_tabs.dart';
import '../widgets/handshake_dialog.dart';
import '../widgets/optical_qr_dialog.dart';
import 'chat_hud_screen.dart';

class RadarScreen extends StatefulWidget {
  const RadarScreen({super.key});

  @override
  State<RadarScreen> createState() => _RadarScreenState();
}

class _RadarScreenState extends State<RadarScreen> {
  int _handshakeStep = 0;
  String _handshakeTitle = '';
  bool _isHandshakeVisible = false;

  @override
  void initState() {
    super.initState();
    final mesh = MeshService();
    mesh.addListener(_onMeshUpdated);

    mesh.onHandshakeStarted = (title) {
      setState(() {
        _handshakeTitle = title;
        _handshakeStep = 1;
        _isHandshakeVisible = true;
      });
      _showHandshakeDialog();
    };

    mesh.onHandshakeStepUpdate = (step, status) {
      setState(() {
        _handshakeStep = step;
      });
    };

    mesh.onHandshakeCompleted = () {
      if (_isHandshakeVisible) {
        Navigator.of(context, rootNavigator: true).pop();
        _isHandshakeVisible = false;
      }
      if (mesh.activePeer != null) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ChatHudScreen(peer: mesh.activePeer!),
          ),
        );
      }
    };

    // Connect to server (Render or Localhost)
    mesh.connectToMeshServer('https://privy-chat.onrender.com');
  }

  @override
  void dispose() {
    MeshService().removeListener(_onMeshUpdated);
    super.dispose();
  }

  void _onMeshUpdated() {
    setState(() {});
  }

  void _showHandshakeDialog() {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => HandshakeDialog(
        title: _handshakeTitle,
        currentStep: _handshakeStep,
        onCancel: () {
          Navigator.of(ctx).pop();
          _isHandshakeVisible = false;
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

  @override
  Widget build(BuildContext context) {
    final mesh = MeshService();

    return Scaffold(
      backgroundColor: const Color(0xFF030712),
      appBar: AppBar(
        backgroundColor: const Color(0xFF071A10),
        elevation: 0,
        title: Row(
          children: [
            const Icon(LucideIcons.radio, color: Color(0xFF22C55E), size: 20),
            const SizedBox(width: 8),
            const Text(
              'NEARBY MESH',
              style: TextStyle(
                fontFamily: 'Courier',
                fontWeight: FontWeight.bold,
                fontSize: 15,
                color: Color(0xFF22C55E),
                letterSpacing: 1.2,
              ),
            ),
          ],
        ),
        actions: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
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
                const SizedBox(width: 6),
                Text(
                  mesh.isConnectedToMesh ? 'RADAR ACTIVE' : 'OFFLINE',
                  style: TextStyle(
                    fontSize: 9.5,
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
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Active Engineering Beta Banner
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    const Color(0xFF06B6D4).withOpacity(0.12),
                    const Color(0xFF22C55E).withOpacity(0.12),
                  ],
                ),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF06B6D4).withOpacity(0.35)),
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
                    child: const Text('● Native Beta', style: TextStyle(color: Color(0xFF06B6D4), fontSize: 9.5, fontWeight: FontWeight.bold)),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Nearby Tactical Mesh (WiFi, BLE & Air-Gap QR)',
                      style: TextStyle(fontSize: 11, color: Color(0xFFE2E8F0)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // Radar Viewport
            SizedBox(
              height: 260,
              child: RadarCanvasWidget(
                peers: mesh.discoveredPeers,
                onPeerSelected: (peer) => mesh.connectToPeer(peer),
              ),
            ),
            const SizedBox(height: 16),

            // Mode Selector Tabs
            DiscoveryTabs(
              activeMode: mesh.mode,
              onModeChanged: (newMode) {
                mesh.updateProfile(mod: newMode);
                if (newMode == 'qr') {
                  _openOpticalQrDialog();
                }
              },
            ),
            const SizedBox(height: 20),

            // Discovered Peers List
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'DISCOVERED PEERS',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, fontFamily: 'Courier', color: Color(0xFF94A3B8)),
                ),
                Text(
                  '${mesh.discoveredPeers.length} In Range',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF22C55E), fontFamily: 'Courier'),
                ),
              ],
            ),
            const SizedBox(height: 10),

            if (mesh.discoveredPeers.isEmpty)
              Container(
                padding: const EdgeInsets.all(24),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: const Color(0xFF071A10),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.2)),
                ),
                child: Column(
                  children: [
                    const Icon(LucideIcons.radio, color: Color(0xFF22C55E), size: 28),
                    const SizedBox(height: 10),
                    const Text(
                      'Scanning for nearby devices...',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.white),
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'Ensure other devices are on this Wi-Fi or have Bluetooth/Air-Gap QR open.',
                      style: TextStyle(fontSize: 10.5, color: Color(0xFF64748B)),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              )
            else
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: mesh.discoveredPeers.length,
                itemBuilder: (context, index) {
                  final peer = mesh.discoveredPeers[index];
                  return _buildPeerCard(peer);
                },
              ),
          ],
        ),
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
        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.25)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.08),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(peer.avatar, style: const TextStyle(fontSize: 18)),
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
                Text(
                  peer.mode == 'ble' ? '📶 Bluetooth BLE' : '📡 Local WiFi Subnet',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8), fontFamily: 'Courier'),
                ),
              ],
            ),
          ),
          ElevatedButton(
            onPressed: () => MeshService().connectToPeer(peer),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF22C55E),
              foregroundColor: Colors.black,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            child: const Text('Connect', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

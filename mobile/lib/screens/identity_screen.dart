import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../services/mesh_service.dart';
import 'radar_screen.dart';

class IdentityScreen extends StatefulWidget {
  const IdentityScreen({super.key});

  @override
  State<IdentityScreen> createState() => _IdentityScreenState();
}

class _IdentityScreenState extends State<IdentityScreen> {
  final _nicknameCtrl = TextEditingController();
  String _selectedAvatar = '🕵️';
  bool _isConnecting = false;

  final List<String> _avatars = [
    '🕵️', '🦅', '🐺', '🦾', '🧬', '🔐', '🛡️', '⚡',
    '🎯', '🔮', '💀', '🦊', '🤖', '🐉', '🌑', '🔥',
  ];

  final List<String> _serverOptions = [
    'https://privy-chat.onrender.com',
    'http://localhost:3001',
    'http://10.0.2.2:3001', // Android emulator localhost
  ];
  late String _selectedServer;

  @override
  void initState() {
    super.initState();
    _selectedServer = _serverOptions[0];
    final ms = MeshService();
    _nicknameCtrl.text = ms.nickname;
    _selectedAvatar = ms.avatar;
  }

  @override
  void dispose() {
    _nicknameCtrl.dispose();
    super.dispose();
  }

  Future<void> _enterMesh() async {
    final nick = _nicknameCtrl.text.trim();
    if (nick.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Enter a callsign / nickname'),
          backgroundColor: Color(0xFFEF4444),
        ),
      );
      return;
    }

    setState(() => _isConnecting = true);

    final mesh = MeshService();
    mesh.updateProfile(nick: nick, ava: _selectedAvatar);
    await mesh.connectToMeshServer(_selectedServer);

    if (mounted) {
      setState(() => _isConnecting = false);
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const RadarScreen()),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF030712),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 30),

              // Logo & Title
              Center(
                child: Column(
                  children: [
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(18),
                        gradient: const LinearGradient(
                          colors: [Color(0xFF22C55E), Color(0xFF06B6D4)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFF22C55E).withOpacity(0.3),
                            blurRadius: 20,
                          ),
                        ],
                      ),
                      child: const Center(
                        child: Text('P', style: TextStyle(fontSize: 40, color: Colors.black, fontWeight: FontWeight.bold)),
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'PRIVYCHAT',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF22C55E),
                        letterSpacing: 3,
                        fontFamily: 'Courier',
                      ),
                    ),
                    const Text(
                      'TACTICAL MESH MESSENGER',
                      style: TextStyle(
                        fontSize: 10,
                        color: Color(0xFF64748B),
                        letterSpacing: 2,
                        fontFamily: 'Courier',
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 36),

              // Identity Setup Card
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: const Color(0xFF071A10),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.25)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(LucideIcons.userCheck, color: Color(0xFF22C55E), size: 16),
                        const SizedBox(width: 8),
                        const Text(
                          'SET FIELD IDENTITY',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'Courier',
                            color: Color(0xFF22C55E),
                            letterSpacing: 1,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),

                    // Callsign input
                    const Text('CALLSIGN', style: TextStyle(fontSize: 9.5, color: Color(0xFF64748B), fontFamily: 'Courier', letterSpacing: 1)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _nicknameCtrl,
                      style: const TextStyle(color: Colors.white, fontSize: 14, fontFamily: 'Courier'),
                      maxLength: 20,
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: const Color(0xFF0D1B1E),
                        hintText: 'e.g. Agent_X, Priya, TechWolf...',
                        hintStyle: const TextStyle(color: Color(0xFF475569), fontSize: 12),
                        counterText: '',
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: const Color(0xFF22C55E).withOpacity(0.3)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: BorderSide(color: const Color(0xFF22C55E).withOpacity(0.2)),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(10),
                          borderSide: const BorderSide(color: Color(0xFF22C55E)),
                        ),
                        prefixIcon: const Icon(LucideIcons.terminal, color: Color(0xFF22C55E), size: 16),
                      ),
                    ),

                    const SizedBox(height: 18),

                    // Avatar grid
                    const Text('AVATAR', style: TextStyle(fontSize: 9.5, color: Color(0xFF64748B), fontFamily: 'Courier', letterSpacing: 1)),
                    const SizedBox(height: 8),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 8,
                        mainAxisSpacing: 6,
                        crossAxisSpacing: 6,
                      ),
                      itemCount: _avatars.length,
                      itemBuilder: (context, i) {
                        final isSelected = _avatars[i] == _selectedAvatar;
                        return GestureDetector(
                          onTap: () => setState(() => _selectedAvatar = _avatars[i]),
                          child: Container(
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(8),
                              color: isSelected
                                  ? const Color(0xFF22C55E).withOpacity(0.2)
                                  : const Color(0xFF0D1B1E),
                              border: Border.all(
                                color: isSelected ? const Color(0xFF22C55E) : Colors.transparent,
                                width: 1.5,
                              ),
                            ),
                            child: Center(
                              child: Text(_avatars[i], style: const TextStyle(fontSize: 18)),
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Server Selection
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF071A10),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFF06B6D4).withOpacity(0.2)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'MESH SERVER',
                      style: TextStyle(fontSize: 9.5, color: Color(0xFF64748B), fontFamily: 'Courier', letterSpacing: 1),
                    ),
                    const SizedBox(height: 8),
                    DropdownButtonFormField<String>(
                      value: _selectedServer,
                      dropdownColor: const Color(0xFF071A10),
                      decoration: InputDecoration(
                        filled: true,
                        fillColor: const Color(0xFF0D1B1E),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: const Color(0xFF06B6D4).withOpacity(0.3)),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: const Color(0xFF06B6D4).withOpacity(0.2)),
                        ),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      ),
                      items: _serverOptions.map((s) => DropdownMenuItem(
                        value: s,
                        child: Text(
                          s.replaceAll('https://', '').replaceAll('http://', ''),
                          style: const TextStyle(fontSize: 11, color: Color(0xFF94A3B8), fontFamily: 'Courier'),
                        ),
                      )).toList(),
                      onChanged: (v) => setState(() => _selectedServer = v!),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 28),

              // Feature pills
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: const [
                  _FeaturePill('🔐 E2EE AES-256'),
                  _FeaturePill('📡 WiFi Mesh'),
                  _FeaturePill('📶 Bluetooth'),
                  _FeaturePill('📷 Air-Gap QR'),
                  _FeaturePill('🔥 Burn Timer'),
                  _FeaturePill('👻 Ghost Mode'),
                ],
              ),

              const SizedBox(height: 28),

              // Enter Mesh Button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: ElevatedButton(
                  onPressed: _isConnecting ? null : _enterMesh,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF22C55E),
                    foregroundColor: Colors.black,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    elevation: 0,
                  ),
                  child: _isConnecting
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.black),
                        )
                      : const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(LucideIcons.radio, size: 18),
                            SizedBox(width: 10),
                            Text('ENTER TACTICAL MESH', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, letterSpacing: 1)),
                          ],
                        ),
                ),
              ),

              const SizedBox(height: 16),

              // Privacy note
              const Center(
                child: Text(
                  'Zero-knowledge. No accounts. No logs. No servers store messages.',
                  style: TextStyle(fontSize: 10, color: Color(0xFF475569)),
                  textAlign: TextAlign.center,
                ),
              ),

              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _FeaturePill extends StatelessWidget {
  final String label;
  const _FeaturePill(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.3)),
        color: const Color(0xFF22C55E).withOpacity(0.07),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
      ),
    );
  }
}

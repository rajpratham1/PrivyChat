import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import '../services/mesh_service.dart';
import '../services/crypto_engine.dart';
import '../models/peer_model.dart';
import '../models/message_model.dart';

class ChatHudScreen extends StatefulWidget {
  final PeerModel peer;

  const ChatHudScreen({super.key, required this.peer});

  @override
  State<ChatHudScreen> createState() => _ChatHudScreenState();
}

class _ChatHudScreenState extends State<ChatHudScreen> {
  final TextEditingController _msgController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  bool _isCallActive = false;
  int _callSeconds = 0;

  @override
  void initState() {
    super.initState();
    MeshService().addListener(_onMeshUpdated);
  }

  @override
  void dispose() {
    MeshService().removeListener(_onMeshUpdated);
    _msgController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onMeshUpdated() {
    setState(() {});
    _scrollToBottom();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    }
  }

  void _sendMessage() {
    final text = _msgController.text;
    if (text.trim().isNotEmpty) {
      MeshService().sendTextMessage(text);
      _msgController.clear();
    }
  }

  @override
  Widget build(BuildContext context) {
    final mesh = MeshService();
    final crypto = CryptoEngine();

    return Scaffold(
      backgroundColor: const Color(0xFF030712),
      appBar: AppBar(
        backgroundColor: const Color(0xFF071A10),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft, color: Color(0xFF22C55E)),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(widget.peer.avatar, style: const TextStyle(fontSize: 16)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    widget.peer.nickname,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: Color(0xFF22C55E),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        'E2EE AES-256 • ${crypto.safetyEmojis}',
                        style: const TextStyle(fontSize: 9.5, color: Color(0xFF22C55E), fontFamily: 'Courier'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          // Ghost Mode Toggle
          IconButton(
            icon: Icon(
              mesh.isGhostMode ? LucideIcons.eyeOff : LucideIcons.eye,
              color: mesh.isGhostMode ? const Color(0xFFA855F7) : const Color(0xFF94A3B8),
              size: 18,
            ),
            onPressed: () => mesh.toggleGhostMode(),
          ),
          // Panic Purge Button
          IconButton(
            icon: const Icon(LucideIcons.alertTriangle, color: Color(0xFFEF4444), size: 18),
            onPressed: () {
              mesh.panicPurge();
              Navigator.of(context).popUntil((route) => route.isFirst);
            },
          ),
        ],
      ),
      body: Column(
        children: [
          // Tactical Safety Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            color: const Color(0xFF0D1B1E),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'FINGERPRINT: ${crypto.safetyFingerprint}',
                  style: const TextStyle(fontSize: 9, color: Color(0xFF64748B), fontFamily: 'Courier'),
                ),
                DropdownButton<int>(
                  value: mesh.burnTimer,
                  dropdownColor: const Color(0xFF071A10),
                  underline: const SizedBox(),
                  icon: const Icon(LucideIcons.flame, color: Color(0xFFEF4444), size: 14),
                  items: const [
                    DropdownMenuItem(value: 0, child: Text('🔥 Burn: Off', style: TextStyle(fontSize: 10, color: Colors.white))),
                    DropdownMenuItem(value: 5, child: Text('🔥 5s Burn', style: TextStyle(fontSize: 10, color: Colors.orange))),
                    DropdownMenuItem(value: 15, child: Text('🔥 15s Burn', style: TextStyle(fontSize: 10, color: Colors.orange))),
                    DropdownMenuItem(value: 30, child: Text('🔥 30s Burn', style: TextStyle(fontSize: 10, color: Colors.orange))),
                  ],
                  onChanged: (val) {
                    if (val != null) mesh.updateProfile(burn: val);
                  },
                ),
              ],
            ),
          ),

          // Messages List
          Expanded(
            child: mesh.messages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(LucideIcons.shieldCheck, color: Color(0xFF22C55E), size: 36),
                        const SizedBox(height: 10),
                        const Text(
                          'P2P ENCRYPTED SESSION ACTIVE',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            fontFamily: 'Courier',
                            color: Color(0xFF22C55E),
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Messages are zero-knowledge & purged on disconnect.',
                          style: TextStyle(fontSize: 10.5, color: Color(0xFF64748B)),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: mesh.messages.length,
                    itemBuilder: (context, index) {
                      final msg = mesh.messages[index];
                      return _buildMessageBubble(msg, mesh.isGhostMode);
                    },
                  ),
          ),

          // Bottom Input Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF071A10),
              border: Border(top: BorderSide(color: const Color(0xFF22C55E).withOpacity(0.2))),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0D1B1E),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.2)),
                      ),
                      child: TextField(
                        controller: _msgController,
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                        decoration: const InputDecoration(
                          hintText: 'Transmit encrypted message...',
                          hintStyle: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                          border: InputBorder.none,
                          isDense: true,
                        ),
                        onSubmitted: (_) => _sendMessage(),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    decoration: const BoxDecoration(
                      color: Color(0xFF22C55E),
                      shape: BoxShape.circle,
                    ),
                    child: IconButton(
                      icon: const Icon(LucideIcons.send, color: Colors.black, size: 16),
                      onPressed: _sendMessage,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageBubble(MessageModel msg, bool isGhostMode) {
    final isSent = msg.isSent;

    return Align(
      alignment: isSent ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: isSent ? const Color(0xFF22C55E).withOpacity(0.18) : const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSent ? const Color(0xFF22C55E).withOpacity(0.4) : const Color(0xFF475569).withOpacity(0.3),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (!isSent) ...[
              Text(
                '${msg.avatar} ${msg.sender}',
                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Color(0xFF22C55E)),
              ),
              const SizedBox(height: 2),
            ],
            Text(
              msg.text ?? '',
              style: TextStyle(
                color: isGhostMode ? Colors.transparent : Colors.white,
                fontSize: 13,
                shadows: isGhostMode ? [const Shadow(color: Colors.white70, blurRadius: 8)] : null,
              ),
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (msg.burnSeconds > 0) ...[
                  const Icon(LucideIcons.flame, color: Colors.orange, size: 10),
                  const SizedBox(width: 2),
                  Text('${msg.burnSeconds}s', style: const TextStyle(fontSize: 8.5, color: Colors.orange)),
                  const SizedBox(width: 6),
                ],
                Text(
                  '${msg.timestamp.hour.toString().padLeft(2, '0')}:${msg.timestamp.minute.toString().padLeft(2, '0')}',
                  style: const TextStyle(fontSize: 8.5, color: Color(0xFF64748B)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

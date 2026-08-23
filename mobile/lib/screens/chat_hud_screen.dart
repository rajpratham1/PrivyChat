import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import '../services/mesh_service.dart';
import '../services/crypto_engine.dart';
import '../models/peer_model.dart';
import '../models/message_model.dart';
import '../widgets/optical_qr_dialog.dart';
import 'identity_screen.dart';

class ChatHudScreen extends StatefulWidget {
  final PeerModel peer;

  const ChatHudScreen({super.key, required this.peer});

  @override
  State<ChatHudScreen> createState() => _ChatHudScreenState();
}

class _ChatHudScreenState extends State<ChatHudScreen> {
  final TextEditingController _msgController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final FocusNode _focusNode = FocusNode();

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
    _focusNode.dispose();
    super.dispose();
  }

  void _onMeshUpdated() {
    if (mounted) {
      setState(() {});
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _sendMessage() async {
    final text = _msgController.text.trim();
    if (text.isEmpty) return;
    final mesh = MeshService();

    if (mesh.shouldUseQrTransport) {
      final payload = await mesh.createQrTextPayload(text);
      if (!mounted) return;
      if (payload == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Complete the QR handshake before sending an optical message.'),
            backgroundColor: Color(0xFFB45309),
          ),
        );
        return;
      }
      _msgController.clear();
      _showQrMessage(payload);
      _focusNode.requestFocus();
      return;
    }

    final sent = await mesh.sendTextMessage(text);
    if (!sent && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No encrypted transport is connected. Select QR or reconnect to the mesh.'),
          backgroundColor: Color(0xFFB45309),
        ),
      );
      return;
    }
    _msgController.clear();
    _focusNode.requestFocus();
  }

  void _copyFingerprint() {
    Clipboard.setData(ClipboardData(text: CryptoEngine().safetyFingerprint));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Safety fingerprint copied'),
        backgroundColor: Color(0xFF22C55E),
        duration: Duration(seconds: 2),
      ),
    );
  }

  void _showSessionInfo() {
    final crypto = CryptoEngine();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF071A10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: const Text('Session Info', style: TextStyle(fontSize: 15, color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _infoRow('Peer', '${widget.peer.avatar} ${widget.peer.nickname}'),
            _infoRow('Mode', widget.peer.mode.toUpperCase()),
            _infoRow('Encryption', 'AES-256-GCM'),
            _infoRow('Key Exchange', 'X25519 / Curve25519'),
            const SizedBox(height: 10),
            const Text('SAFETY FINGERPRINT', style: TextStyle(fontSize: 9.5, color: Color(0xFF64748B), fontFamily: 'Courier', letterSpacing: 1)),
            const SizedBox(height: 4),
            GestureDetector(
              onTap: _copyFingerprint,
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFF0D1B1E),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.3)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        crypto.safetyFingerprint.isNotEmpty ? crypto.safetyFingerprint : 'Generating...',
                        style: const TextStyle(fontSize: 12, color: Color(0xFF22C55E), fontFamily: 'Courier'),
                      ),
                    ),
                    const Icon(LucideIcons.copy, size: 12, color: Color(0xFF64748B)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            const Text('SAFETY EMOJI (read aloud to verify)', style: TextStyle(fontSize: 9.5, color: Color(0xFF64748B), fontFamily: 'Courier', letterSpacing: 1)),
            const SizedBox(height: 4),
            Text(
              crypto.safetyEmojis.isNotEmpty ? crypto.safetyEmojis : '——',
              style: const TextStyle(fontSize: 24),
              textAlign: TextAlign.center,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Close', style: TextStyle(color: Color(0xFF64748B))),
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 80,
            child: Text(label, style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B), fontFamily: 'Courier')),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(fontSize: 11, color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showQrShare() {
    showDialog(
      context: context,
      builder: (ctx) => OpticalQrDialog(
        onQrPeerDecoded: (peer) => MeshService().connectToPeer(peer),
        onQrMessageDecoded: (rawValue) async {
          await MeshService().receiveQrPayload(rawValue);
        },
      ),
    );
  }

  void _showQrMessage(String payload) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => OpticalQrDialog(
        outboundPayload: payload,
        onQrPeerDecoded: (_) {},
        onQrMessageDecoded: (rawValue) async {
          await MeshService().receiveQrPayload(rawValue);
        },
      ),
    );
  }

  void _confirmEndSession() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF071A10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: const Text('End Session?', style: TextStyle(color: Colors.white)),
        content: const Text(
          'This will purge all messages and disconnect from the encrypted channel.',
          style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF64748B))),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              MeshService().terminateSession();
              Navigator.of(context).pop();
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444), foregroundColor: Colors.white),
            child: const Text('End & Purge'),
          ),
        ],
      ),
    );
  }

  void _panicPurge() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A0707),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: Color(0xFFEF4444))),
        title: const Text('⚠️ PANIC PURGE', style: TextStyle(color: Color(0xFFEF4444), fontWeight: FontWeight.bold)),
        content: const Text(
          'ALL messages, keys and session data will be IMMEDIATELY DESTROYED. This cannot be undone.',
          style: TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: Color(0xFF64748B))),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              MeshService().panicPurge();
              Navigator.of(context).pushAndRemoveUntil(
                MaterialPageRoute(builder: (_) => const IdentityScreen()),
                (route) => false,
              );
            },
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFFEF4444), foregroundColor: Colors.white),
            child: const Text('PURGE NOW'),
          ),
        ],
      ),
    );
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
          onPressed: _confirmEndSession,
        ),
        title: GestureDetector(
          onTap: _showSessionInfo,
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.08), borderRadius: BorderRadius.circular(8)),
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
                        Container(width: 5, height: 5, decoration: const BoxDecoration(color: Color(0xFF22C55E), shape: BoxShape.circle)),
                        const SizedBox(width: 4),
                        Text(
                          'E2EE • ${crypto.safetyEmojis.isNotEmpty ? crypto.safetyEmojis : "Securing..."}',
                          style: const TextStyle(fontSize: 9.5, color: Color(0xFF22C55E), fontFamily: 'Courier'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          // Ghost Mode
          IconButton(
            icon: Icon(
              mesh.isGhostMode ? LucideIcons.eyeOff : LucideIcons.eye,
              color: mesh.isGhostMode ? const Color(0xFFA855F7) : const Color(0xFF64748B),
              size: 18,
            ),
            tooltip: 'Ghost Mode',
            onPressed: () => mesh.toggleGhostMode(),
          ),
          // QR Air-Gap
          IconButton(
            icon: const Icon(LucideIcons.qrCode, color: Color(0xFF06B6D4), size: 18),
            tooltip: 'Air-Gap QR',
            onPressed: _showQrShare,
          ),
          // Panic purge
          IconButton(
            icon: const Icon(LucideIcons.alertTriangle, color: Color(0xFFEF4444), size: 18),
            tooltip: 'Panic Purge',
            onPressed: _panicPurge,
          ),
        ],
      ),
      body: Column(
        children: [
          // Tactical Safety Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            color: const Color(0xFF0D1B1E),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: _copyFingerprint,
                    child: Text(
                      crypto.safetyFingerprint.isNotEmpty
                          ? '🔐 ${crypto.safetyFingerprint}'
                          : '🔐 Generating fingerprint...',
                      style: const TextStyle(fontSize: 8.5, color: Color(0xFF64748B), fontFamily: 'Courier'),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                DropdownButton<int>(
                  value: mesh.burnTimer,
                  dropdownColor: const Color(0xFF071A10),
                  underline: const SizedBox(),
                  isDense: true,
                  icon: const Icon(LucideIcons.flame, color: Color(0xFFEF4444), size: 12),
                  items: const [
                    DropdownMenuItem(value: 0, child: Text('No Burn', style: TextStyle(fontSize: 9.5, color: Colors.white))),
                    DropdownMenuItem(value: 5, child: Text('5s Burn', style: TextStyle(fontSize: 9.5, color: Colors.orange))),
                    DropdownMenuItem(value: 15, child: Text('15s Burn', style: TextStyle(fontSize: 9.5, color: Colors.orange))),
                    DropdownMenuItem(value: 30, child: Text('30s Burn', style: TextStyle(fontSize: 9.5, color: Colors.orange))),
                    DropdownMenuItem(value: 60, child: Text('60s Burn', style: TextStyle(fontSize: 9.5, color: Colors.orange))),
                  ],
                  onChanged: (val) {
                    if (val != null) mesh.updateProfile(burn: val);
                  },
                ),
              ],
            ),
          ),

          // Ghost mode banner
          if (mesh.isGhostMode)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 4),
              color: const Color(0xFFA855F7).withOpacity(0.12),
              child: const Center(
                child: Text(
                  '👻 GHOST MODE — Messages hidden from screen',
                  style: TextStyle(fontSize: 10, color: Color(0xFFA855F7), fontFamily: 'Courier'),
                ),
              ),
            ),

          // Messages
          Expanded(
            child: mesh.messages.isEmpty
                ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(LucideIcons.shieldCheck, color: Color(0xFF22C55E), size: 34),
                        const SizedBox(height: 10),
                        const Text(
                          'ENCRYPTED SESSION ACTIVE',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, fontFamily: 'Courier', color: Color(0xFF22C55E)),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Chatting with ${widget.peer.nickname}',
                          style: const TextStyle(fontSize: 11, color: Color(0xFF64748B)),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'Messages are zero-knowledge & purged on disconnect.',
                          style: TextStyle(fontSize: 10, color: Color(0xFF475569)),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 20),
                        // Safety verify prompt
                        Container(
                          margin: const EdgeInsets.symmetric(horizontal: 30),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFF071A10),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.2)),
                          ),
                          child: Column(
                            children: [
                              const Text(
                                'VERIFY PEER — Read aloud:',
                                style: TextStyle(fontSize: 9.5, color: Color(0xFF64748B), fontFamily: 'Courier'),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                crypto.safetyEmojis.isNotEmpty ? crypto.safetyEmojis : '——',
                                style: const TextStyle(fontSize: 24),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
                    itemCount: mesh.messages.length,
                    itemBuilder: (context, index) {
                      return _buildMessageBubble(mesh.messages[index], mesh.isGhostMode);
                    },
                  ),
          ),

          // Input Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF071A10),
              border: Border(top: BorderSide(color: const Color(0xFF22C55E).withOpacity(0.15))),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  // Attach/QR quick button
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: const Color(0xFF0D1B1E),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.2)),
                    ),
                    child: IconButton(
                      padding: EdgeInsets.zero,
                      icon: const Icon(LucideIcons.plus, color: Color(0xFF94A3B8), size: 16),
                      onPressed: () => _showAttachMenu(),
                    ),
                  ),
                  const SizedBox(width: 8),

                  // Text input
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0D1B1E),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.2)),
                      ),
                      child: TextField(
                        controller: _msgController,
                        focusNode: _focusNode,
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                        maxLines: 4,
                        minLines: 1,
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _sendMessage(),
                        decoration: const InputDecoration(
                          hintText: 'Transmit encrypted message...',
                          hintStyle: TextStyle(color: Color(0xFF475569), fontSize: 12),
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),

                  // Send button
                  GestureDetector(
                    onTap: _sendMessage,
                    child: Container(
                      width: 40,
                      height: 40,
                      decoration: const BoxDecoration(
                        color: Color(0xFF22C55E),
                        shape: BoxShape.circle,
                      ),
                      child: const Center(
                        child: Icon(LucideIcons.send, color: Colors.black, size: 16),
                      ),
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

  void _showAttachMenu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF071A10),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('ATTACH / SHARE', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, fontFamily: 'Courier', color: Color(0xFF94A3B8), letterSpacing: 1)),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _attachOption(LucideIcons.qrCode, 'Air-Gap QR', const Color(0xFF06B6D4), () {
                  Navigator.pop(ctx);
                  _showQrShare();
                }),
                _attachOption(LucideIcons.shieldCheck, 'Verify Peer', const Color(0xFF22C55E), () {
                  Navigator.pop(ctx);
                  _showSessionInfo();
                }),
                _attachOption(LucideIcons.alertTriangle, 'Panic Purge', const Color(0xFFEF4444), () {
                  Navigator.pop(ctx);
                  _panicPurge();
                }),
              ],
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _attachOption(IconData icon, String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              shape: BoxShape.circle,
              border: Border.all(color: color.withOpacity(0.4)),
            ),
            child: Center(child: Icon(icon, color: color, size: 22)),
          ),
          const SizedBox(height: 6),
          Text(label, style: TextStyle(fontSize: 10, color: color, fontFamily: 'Courier')),
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
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
        decoration: BoxDecoration(
          color: isSent ? const Color(0xFF22C55E).withOpacity(0.15) : const Color(0xFF1E293B),
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: isSent ? const Radius.circular(14) : const Radius.circular(4),
            bottomRight: isSent ? const Radius.circular(4) : const Radius.circular(14),
          ),
          border: Border.all(
            color: isSent ? const Color(0xFF22C55E).withOpacity(0.35) : const Color(0xFF475569).withOpacity(0.25),
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
              const SizedBox(height: 3),
            ],
            Text(
              msg.text ?? '',
              style: TextStyle(
                color: isGhostMode ? Colors.transparent : Colors.white,
                fontSize: 13.5,
                height: 1.4,
                shadows: isGhostMode ? [const Shadow(color: Colors.white70, blurRadius: 8)] : null,
              ),
            ),
            const SizedBox(height: 4),
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
                  style: const TextStyle(fontSize: 8.5, color: Color(0xFF475569)),
                ),
                if (isSent) ...[
                  const SizedBox(width: 4),
                  const Icon(Icons.done_all, size: 10, color: Color(0xFF22C55E)),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

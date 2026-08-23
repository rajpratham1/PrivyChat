import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../models/group_model.dart';
import '../models/message_model.dart';
import '../services/mesh_service.dart';

class GroupChatScreen extends StatefulWidget {
  final GroupModel group;

  const GroupChatScreen({super.key, required this.group});

  @override
  State<GroupChatScreen> createState() => _GroupChatScreenState();
}

class _GroupChatScreenState extends State<GroupChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    MeshService().addListener(_updated);
  }

  @override
  void dispose() {
    MeshService().removeListener(_updated);
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _updated() {
    if (mounted) {
      setState(() {});
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scrollController.hasClients) _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      });
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final sent = await MeshService().sendGroupText(widget.group.id, text);
    if (!sent && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Connect to at least one group member first.'), backgroundColor: Color(0xFFB45309)));
      return;
    }
    _controller.clear();
  }

  @override
  Widget build(BuildContext context) {
    final messages = MeshService().groupMessages(widget.group.id);
    return Scaffold(
      backgroundColor: const Color(0xFF030712),
      appBar: AppBar(
        backgroundColor: const Color(0xFF071A10),
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(widget.group.name, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
          Text('${widget.group.members.length + 1} nearby members', style: const TextStyle(color: Color(0xFF22C55E), fontSize: 9, fontFamily: 'Courier')),
        ]),
      ),
      body: Column(
        children: [
          Expanded(
            child: messages.isEmpty
                ? const Center(child: Text('Encrypted group channel ready', style: TextStyle(color: Color(0xFF64748B), fontSize: 12)))
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: messages.length,
                    itemBuilder: (context, index) => _bubble(messages[index]),
                  ),
          ),
          SafeArea(
            child: Container(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              color: const Color(0xFF071A10),
              child: Row(children: [
                Expanded(child: TextField(controller: _controller, style: const TextStyle(color: Colors.white, fontSize: 13), onSubmitted: (_) => _send(), decoration: const InputDecoration(hintText: 'Message group…', hintStyle: TextStyle(color: Color(0xFF475569)), border: InputBorder.none))),
                IconButton(onPressed: _send, icon: const Icon(LucideIcons.send, color: Color(0xFF22C55E), size: 19)),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bubble(MessageModel message) {
    return Align(
      alignment: message.isSent ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * .8),
        decoration: BoxDecoration(color: message.isSent ? const Color(0xFF22C55E).withOpacity(.15) : const Color(0xFF1E293B), borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (!message.isSent) Text('${message.avatar} ${message.sender}', style: const TextStyle(color: Color(0xFF22C55E), fontSize: 10)),
          Text(message.text ?? '', style: const TextStyle(color: Colors.white, fontSize: 13)),
        ]),
      ),
    );
  }
}

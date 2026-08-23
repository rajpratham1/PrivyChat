import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../services/mesh_service.dart';
import 'group_chat_screen.dart';

class GroupListScreen extends StatefulWidget {
  const GroupListScreen({super.key});

  @override
  State<GroupListScreen> createState() => _GroupListScreenState();
}

class _GroupListScreenState extends State<GroupListScreen> {
  final _nameController = TextEditingController();
  final Set<String> _selectedPeerIds = <String>{};

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _createGroup() async {
    final mesh = MeshService();
    final peers = mesh.discoveredPeers.where((peer) => _selectedPeerIds.contains(peer.id)).toList();
    final group = await mesh.createGroup(_nameController.text, peers);
    if (!mounted) return;
    if (group == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(_nameController.text.trim().isEmpty
              ? 'Enter a group name first.'
              : 'No selected peer could be reached. Keep the nearby app open and try again.'),
          backgroundColor: const Color(0xFFB45309),
        ),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => GroupChatScreen(group: group)),
    );
  }

  void _showCreateDialog() {
    final mesh = MeshService();
    _selectedPeerIds
      ..clear()
      ..addAll(mesh.discoveredPeers.map((peer) => peer.id));
    _nameController.clear();
    showDialog(
      context: context,
      builder: (dialogContext) => StatefulBuilder(
        builder: (context, setDialogState) => AlertDialog(
          backgroundColor: const Color(0xFF071A10),
          title: const Text('Create nearby group', style: TextStyle(color: Colors.white, fontSize: 16)),
          content: SizedBox(
            width: double.maxFinite,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: _nameController,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(
                      labelText: 'Group name',
                      labelStyle: TextStyle(color: Color(0xFF94A3B8)),
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('Invite nearby peers', style: TextStyle(color: Color(0xFF94A3B8), fontSize: 11)),
                  ),
                  const SizedBox(height: 6),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text('The app will establish each selected Wi-Fi/BLE link before sending the encrypted group key.', style: TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                  ),
                  const SizedBox(height: 8),
                  if (mesh.discoveredPeers.isEmpty)
                    const Text('No nearby peers discovered yet.', style: TextStyle(color: Color(0xFF64748B), fontSize: 11))
                  else
                    ...mesh.discoveredPeers.map(
                      (peer) => CheckboxListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        value: _selectedPeerIds.contains(peer.id),
                        onChanged: (selected) => setDialogState(() {
                          if (selected == true) {
                            _selectedPeerIds.add(peer.id);
                          } else {
                            _selectedPeerIds.remove(peer.id);
                          }
                        }),
                        title: Text('${peer.avatar} ${peer.nickname}', style: const TextStyle(color: Colors.white, fontSize: 12)),
                        subtitle: Text(peer.mode.toUpperCase(), style: const TextStyle(color: Color(0xFF64748B), fontSize: 9)),
                        activeColor: const Color(0xFF22C55E),
                      ),
                    ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(dialogContext), child: const Text('Cancel', style: TextStyle(color: Color(0xFF64748B)))),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(dialogContext);
                _createGroup();
              },
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF22C55E), foregroundColor: Colors.black),
              child: const Text('Create'),
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
        title: const Text('NEARBY GROUPS', style: TextStyle(fontFamily: 'Courier', color: Color(0xFF22C55E), fontSize: 14)),
        actions: [
          IconButton(onPressed: _showCreateDialog, icon: const Icon(LucideIcons.plus, color: Color(0xFF22C55E))),
        ],
      ),
      body: AnimatedBuilder(
        animation: mesh,
        builder: (context, _) {
          final groups = mesh.groups;
          if (groups.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(LucideIcons.users, color: Color(0xFF22C55E), size: 36),
                    const SizedBox(height: 12),
                    const Text('No group sessions', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 6),
                    const Text('Create a group from discovered Wi-Fi or BLE peers.', style: TextStyle(color: Color(0xFF64748B), fontSize: 11), textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(onPressed: _showCreateDialog, icon: const Icon(LucideIcons.plus, size: 15), label: const Text('Create group'), style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF22C55E), foregroundColor: Colors.black)),
                  ],
                ),
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(14),
            itemCount: groups.length,
            itemBuilder: (context, index) {
              final group = groups[index];
              return Card(
                color: const Color(0xFF071A10),
                child: ListTile(
                  leading: const CircleAvatar(backgroundColor: Color(0xFF0D1B1E), child: Icon(LucideIcons.users, color: Color(0xFF22C55E), size: 18)),
                  title: Text(group.name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  subtitle: Text('${group.members.length + 1} members • ${group.creator}', style: const TextStyle(color: Color(0xFF64748B), fontSize: 10)),
                  trailing: const Icon(LucideIcons.chevronRight, color: Color(0xFF22C55E), size: 18),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => GroupChatScreen(group: group))),
                ),
              );
            },
          );
        },
      ),
    );
  }
}

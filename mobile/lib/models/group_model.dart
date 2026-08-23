import 'peer_model.dart';

class GroupModel {
  final String id;
  final String name;
  final String key;
  final String creator;
  final List<PeerModel> members;

  const GroupModel({
    required this.id,
    required this.name,
    required this.key,
    required this.creator,
    this.members = const [],
  });

  GroupModel copyWith({List<PeerModel>? members}) => GroupModel(
        id: id,
        name: name,
        key: key,
        creator: creator,
        members: members ?? this.members,
      );
}

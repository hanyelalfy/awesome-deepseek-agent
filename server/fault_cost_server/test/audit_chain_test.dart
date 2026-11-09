import 'package:fault_cost_server/fault_cost_server.dart';
import 'package:test/test.dart';

void main() {
  test('verifies a hash chain and rejects a disconnected record', () {
    final createdAt = DateTime.utc(2026, 11, 9);
    final first = AuditRecord.create(
      id: 'A-1',
      actorId: 'monitor-1',
      action: 'fault.opened',
      entity: 'fault',
      entityId: 'F-1',
      createdAt: createdAt,
      payload: const {'severity': 4},
    );
    final second = AuditRecord.create(
      id: 'A-2',
      actorId: 'tech-1',
      action: 'fault.assigned',
      entity: 'fault',
      entityId: 'F-1',
      createdAt: createdAt.add(const Duration(minutes: 2)),
      payload: const {'technicianId': 'tech-1'},
      previousHash: first.hash,
    );

    expect(AuditChain.verify([first, second]), isTrue);
    expect(AuditChain.verify([second]), isFalse);
    expect(AuditChain.verify([first, first]), isFalse);
  });

  test('rejects non-UTC audit timestamps', () {
    expect(
      () => AuditRecord.create(
        id: 'A-1',
        actorId: 'monitor-1',
        action: 'fault.opened',
        entity: 'fault',
        entityId: 'F-1',
        createdAt: DateTime(2026, 11, 9),
        payload: const {},
      ),
      throwsArgumentError,
    );
  });

  test('deeply freezes payloads and canonicalizes nested map keys', () {
    final nested = <String, Object?>{'z': 1, 'a': 2};
    final payload = <String, Object?>{'nested': nested};
    final first = AuditRecord.create(
      id: 'A-1',
      actorId: 'monitor-1',
      action: 'fault.opened',
      entity: 'fault',
      entityId: 'F-1',
      createdAt: DateTime.utc(2026, 11, 9),
      payload: payload,
    );
    nested['a'] = 999;
    expect(first.hasValidHash, isTrue);
    expect(
      () => (first.payload['nested'] as Map<String, Object?>)['a'] = 3,
      throwsUnsupportedError,
    );

    final reordered = AuditRecord.create(
      id: 'A-1',
      actorId: 'monitor-1',
      action: 'fault.opened',
      entity: 'fault',
      entityId: 'F-1',
      createdAt: DateTime.utc(2026, 11, 9),
      payload: const {
        'nested': {'a': 2, 'z': 1},
      },
    );
    expect(reordered.hash, first.hash);
  });
}

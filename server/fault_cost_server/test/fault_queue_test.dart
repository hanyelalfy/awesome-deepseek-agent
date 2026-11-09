import 'package:fault_cost_server/fault_cost_server.dart';
import 'package:test/test.dart';

void main() {
  final reportedAt = DateTime.utc(2026, 11, 9);

  FaultCase fault({
    required String id,
    required int severity,
    required Department department,
    int criticality = 5,
    int reportedMinutesAgo = 0,
  }) =>
      FaultCase.open(
        id: id,
        machineId: 'M-1',
        reportedById: 'monitor-1',
        requiredDepartment: department,
        severity: severity,
        machineCriticality: criticality,
        reportedAt: reportedAt.subtract(Duration(minutes: reportedMinutesAgo)),
      ).queue();

  test('selects only available on-shift technicians with matching specialty', () {
    const candidates = [
      Technician(
        id: 'off-shift',
        department: Department.electrical,
        skillLevel: 5,
        isAvailable: true,
        isOnShift: false,
      ),
      Technician(
        id: 'busy',
        department: Department.electrical,
        skillLevel: 5,
        isAvailable: false,
        isOnShift: true,
      ),
      Technician(
        id: 'wrong-specialty',
        department: Department.loading,
        skillLevel: 5,
        isAvailable: true,
        isOnShift: true,
      ),
      Technician(
        id: 'junior',
        department: Department.electrical,
        skillLevel: 3,
        isAvailable: true,
        isOnShift: true,
      ),
      Technician(
        id: 'senior',
        department: Department.electrical,
        skillLevel: 5,
        isAvailable: true,
        isOnShift: true,
      ),
    ];

    expect(
      FaultQueue.bestAvailableTechnician(
        department: Department.electrical,
        technicians: candidates,
      )?.id,
      'senior',
    );
  });

  test('selects the highest priority pending fault and breaks ties by age', () {
    final pending = [
      fault(
        id: 'old-low',
        severity: 2,
        department: Department.electrical,
        reportedMinutesAgo: 20,
      ),
      fault(
        id: 'new-high',
        severity: 5,
        department: Department.electrical,
        reportedMinutesAgo: 2,
      ),
      fault(
        id: 'old-high',
        severity: 5,
        department: Department.electrical,
        reportedMinutesAgo: 10,
      ),
      fault(id: 'other-team', severity: 5, department: Department.sorting),
    ];
    const technician = Technician(
      id: 'tech-1',
      department: Department.electrical,
      skillLevel: 4,
      isAvailable: true,
      isOnShift: true,
    );

    expect(
      FaultQueue.nextFaultFor(technician: technician, pendingFaults: pending)?.id,
      'old-high',
    );
  });
}

import 'package:fault_cost_server/fault_cost_server.dart';
import 'package:test/test.dart';

void main() {
  test('reports separate loss components and leaves unapproved standards unset', () {
    final reportedAt = DateTime.utc(2026, 11, 9, 8);
    final closed = FaultCase.open(
      id: 'F-1',
      machineId: 'M-1',
      partId: 'P-1',
      reportedById: 'monitor-1',
      requiredDepartment: Department.electrical,
      severity: 4,
      machineCriticality: 5,
      reportedAt: reportedAt,
    )
        .assign(
          technician: Technician(
            id: 'tech-1',
            department: Department.electrical,
            skillLevel: 4,
            isAvailable: true,
            isOnShift: true,
          ),
          at: reportedAt.add(const Duration(minutes: 5)),
        )
        .arrive(at: reportedAt.add(const Duration(minutes: 12)))
        .startRepair(at: reportedAt.add(const Duration(minutes: 20)))
        .finishRepair(at: reportedAt.add(const Duration(minutes: 80)))
        .finishTesting(at: reportedAt.add(const Duration(minutes: 90)))
        .close(
          actorRole: FaultRole.costMonitor,
          rootCauseCode: 'PART_FAILURE',
          at: reportedAt.add(const Duration(minutes: 90)),
        );

    final metrics = FaultLossCalculator.calculate(
      fault: closed,
      costs: const FaultCosts(
        costPerDowntimeMinute: 50,
        spareParts: 200,
        waste: 300,
        labor: 0,
        rework: 0,
      ),
      asOf: closed.closedAt!,
      samePartFaultsInWindow: 3,
      allowedFaultsInWindow: 2,
    );

    expect(metrics.downtimeMinutes, 90);
    expect(metrics.downtimeCost, 4500);
    expect(metrics.totalCost, 5000);
    expect(metrics.waitForAssignmentMinutes, 5);
    expect(metrics.responseMinutes, 7);
    expect(metrics.partWaitMinutes, 0);
    expect(metrics.timeFactor, isNull);
    expect(metrics.financialFactor, isNull);
    expect(metrics.repeatFactor, 1.5);
    expect(metrics.severity, 4);
  });

  test('compares against standards only when positive approved baselines exist', () {
    final start = DateTime.utc(2026, 11, 9, 8);
    final closed = FaultCase.open(
      id: 'F-2',
      machineId: 'M-1',
      reportedById: 'monitor-1',
      requiredDepartment: Department.generalMaintenance,
      severity: 1,
      machineCriticality: 2,
      reportedAt: start,
    )
        .assign(
          technician: Technician(
            id: 'tech-2',
            department: Department.generalMaintenance,
            skillLevel: 4,
            isAvailable: true,
            isOnShift: true,
          ),
          at: start.add(const Duration(minutes: 1)),
        )
        .arrive(at: start.add(const Duration(minutes: 2)))
        .startRepair(at: start.add(const Duration(minutes: 3)))
        .finishRepair(at: start.add(const Duration(minutes: 8)))
        .finishTesting(at: start.add(const Duration(minutes: 10)))
        .close(
          actorRole: FaultRole.costMonitor,
          rootCauseCode: 'WEAR',
          at: start.add(const Duration(minutes: 10)),
        );
    final metrics = FaultLossCalculator.calculate(
      fault: closed,
      costs: const FaultCosts(
        costPerDowntimeMinute: 20,
        spareParts: 0,
        waste: 0,
        labor: 0,
        rework: 0,
      ),
      asOf: closed.closedAt!,
      approvedStandardDowntimeMinutes: 5,
      approvedStandardFaultCost: 250,
      samePartFaultsInWindow: 1,
      allowedFaultsInWindow: 2,
    );

    expect(metrics.timeFactor, 2);
    expect(metrics.financialFactor, 0.8);
    expect(
      () => FaultLossCalculator.calculate(
        fault: closed,
        costs: const FaultCosts(
          costPerDowntimeMinute: 20,
          spareParts: 0,
          waste: 0,
          labor: 0,
          rework: 0,
        ),
        asOf: closed.closedAt!,
        approvedStandardDowntimeMinutes: 0,
        samePartFaultsInWindow: 1,
        allowedFaultsInWindow: 2,
      ),
      throwsArgumentError,
    );
  });

  test('does not turn missing cost inputs into zero-cost results', () {
    final start = DateTime.utc(2026, 11, 9);
    final closed = FaultCase.open(
      id: 'F-3',
      machineId: 'M-1',
      reportedById: 'monitor-1',
      requiredDepartment: Department.sorting,
      severity: 3,
      machineCriticality: 3,
      reportedAt: start,
    )
        .assign(
          technician: Technician(
            id: 'tech-3',
            department: Department.sorting,
            skillLevel: 4,
            isAvailable: true,
            isOnShift: true,
          ),
          at: start.add(const Duration(minutes: 1)),
        )
        .arrive(at: start.add(const Duration(minutes: 2)))
        .startRepair(at: start.add(const Duration(minutes: 3)))
        .finishRepair(at: start.add(const Duration(minutes: 5)))
        .finishTesting(at: start.add(const Duration(minutes: 6)))
        .close(
          actorRole: FaultRole.costMonitor,
          rootCauseCode: 'WEAR',
          at: start.add(const Duration(minutes: 7)),
        );

    final metrics = FaultLossCalculator.calculate(
      fault: closed,
      costs: const FaultCosts(),
      asOf: closed.closedAt!,
      approvedStandardFaultCost: 100,
      samePartFaultsInWindow: 1,
      allowedFaultsInWindow: 1,
    );

    expect(metrics.downtimeCost, isNull);
    expect(metrics.totalCost, isNull);
    expect(metrics.financialFactor, isNull);
  });
}

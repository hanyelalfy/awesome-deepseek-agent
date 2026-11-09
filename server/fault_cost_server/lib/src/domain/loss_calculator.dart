import 'fault_case.dart';

class FaultCosts {
  const FaultCosts({
    this.costPerDowntimeMinute,
    this.spareParts,
    this.waste,
    this.labor,
    this.rework,
  });

  final double? costPerDowntimeMinute;
  final double? spareParts;
  final double? waste;
  final double? labor;
  final double? rework;
}

class FaultLossMetrics {
  const FaultLossMetrics({
    required this.downtimeMinutes,
    required this.waitForAssignmentMinutes,
    required this.responseMinutes,
    required this.diagnosisMinutes,
    required this.partWaitMinutes,
    required this.repairMinutes,
    required this.obstacleMinutes,
    required this.testingMinutes,
    required this.closureReviewMinutes,
    required this.downtimeCost,
    required this.totalCost,
    required this.timeFactor,
    required this.financialFactor,
    required this.repeatFactor,
    required this.severity,
  });

  final double downtimeMinutes;
  final double waitForAssignmentMinutes;
  final double responseMinutes;
  final double diagnosisMinutes;
  final double partWaitMinutes;
  final double repairMinutes;
  final double obstacleMinutes;
  final double testingMinutes;
  final double closureReviewMinutes;
  final double? downtimeCost;
  final double? totalCost;

  /// Null when an approved standard downtime has not been configured.
  final double? timeFactor;

  /// Null when an approved standard fault cost has not been configured.
  final double? financialFactor;

  /// A component only; it is not multiplied into an unapproved composite.
  final double repeatFactor;

  final int severity;
}

class FaultLossCalculator {
  const FaultLossCalculator._();

  static FaultLossMetrics calculate({
    required FaultCase fault,
    required FaultCosts costs,
    required DateTime asOf,
    double? approvedStandardDowntimeMinutes,
    double? approvedStandardFaultCost,
    required int samePartFaultsInWindow,
    required int allowedFaultsInWindow,
  }) {
    if (!fault.isClosed) {
      throw StateError('Loss metrics require a closed fault.');
    }
    _requireNonNegativeOrNull(costs.costPerDowntimeMinute, 'costPerDowntimeMinute');
    _requireNonNegativeOrNull(costs.spareParts, 'spareParts');
    _requireNonNegativeOrNull(costs.waste, 'waste');
    _requireNonNegativeOrNull(costs.labor, 'labor');
    _requireNonNegativeOrNull(costs.rework, 'rework');
    if (samePartFaultsInWindow < 0 || allowedFaultsInWindow < 1) {
      throw ArgumentError('Fault counts must be non-negative and the allowed count positive.');
    }
    _requirePositiveOrNull(approvedStandardDowntimeMinutes, 'approvedStandardDowntimeMinutes');
    _requirePositiveOrNull(approvedStandardFaultCost, 'approvedStandardFaultCost');

    final downtimeMinutes = fault.totalDowntime.inMicroseconds / 60000000;
    final downtimeCost = costs.costPerDowntimeMinute == null
        ? null
        : downtimeMinutes * costs.costPerDowntimeMinute!;
    final costComponents = [
      costs.spareParts,
      costs.waste,
      costs.labor,
      costs.rework,
    ];
    final totalCost = downtimeCost == null || costComponents.any((cost) => cost == null)
        ? null
        : downtimeCost + costComponents.cast<double>().reduce((sum, cost) => sum + cost);
    final asOfMinutes = (stage) =>
        fault.durationFor(stage, asOf: asOf).inMicroseconds / 60000000;

    return FaultLossMetrics(
      downtimeMinutes: downtimeMinutes,
      waitForAssignmentMinutes: asOfMinutes(FaultStage.assignmentWait),
      responseMinutes: asOfMinutes(FaultStage.response),
      diagnosisMinutes: asOfMinutes(FaultStage.diagnosis),
      partWaitMinutes: asOfMinutes(FaultStage.partWait),
      repairMinutes: asOfMinutes(FaultStage.repair),
      obstacleMinutes: asOfMinutes(FaultStage.obstacle),
      testingMinutes: asOfMinutes(FaultStage.testing),
      closureReviewMinutes: asOfMinutes(FaultStage.closureReview),
      downtimeCost: downtimeCost,
      totalCost: totalCost,
      timeFactor: approvedStandardDowntimeMinutes == null
          ? null
          : downtimeMinutes / approvedStandardDowntimeMinutes,
      financialFactor: approvedStandardFaultCost == null || totalCost == null
          ? null
          : totalCost / approvedStandardFaultCost,
      repeatFactor: samePartFaultsInWindow / allowedFaultsInWindow,
      severity: fault.severity,
    );
  }

  static void _requireNonNegativeOrNull(double? value, String name) {
    if (value != null && (!value.isFinite || value < 0)) {
      throw ArgumentError.value(value, name, 'must be a finite non-negative amount');
    }
  }

  static void _requirePositiveOrNull(double? value, String name) {
    if (value != null && (!value.isFinite || value <= 0)) {
      throw ArgumentError.value(value, name, 'must be a finite positive value when supplied');
    }
  }
}

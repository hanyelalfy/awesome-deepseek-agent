import 'dart:io';

import 'package:test/test.dart';
import 'package:yaml/yaml.dart';

void main() {
  test('FAC contract requires idempotency and declares both event directions', () {
    final contractFile = File('../../packages/fac_contract/v1/events.yaml');
    expect(contractFile.existsSync(), isTrue);
    final contract = loadYaml(contractFile.readAsStringSync()) as YamlMap;
    final delivery = contract['delivery'] as YamlMap;

    expect(contract['contract'], 'faultcost-fac');
    expect(contract['version'], 1);
    expect(delivery['semantics'], 'at-least-once');
    expect(delivery['idempotencyKeyRequired'], isTrue);
    expect(
      (contract['faultCostToFac'] as YamlList).map((event) => (event as YamlMap)['name']),
      containsAll(['fault.opened', 'fault.closed', 'waste.recorded', 'part.replaced']),
    );
    expect(
      (contract['facToFaultCost'] as YamlList).map((event) => (event as YamlMap)['name']),
      containsAll(['qc.defect.critical', 'qc.gate.rejected', 'qc.part.flagged']),
    );
  });
}

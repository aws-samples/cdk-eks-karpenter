import { Utils } from '../src/utils';

describe('Kubernetes name validation', () => {
  it('should return true for valid names', () => {
    expect(
      Utils.validateKubernetesNameConformance('my-valid-name'),
    ).toBeTruthy();
  });

  it('should return false for invalid names', () => {
    expect(
      Utils.validateKubernetesNameConformance('myInvalidName'),
    ).toBeFalsy();
  });
});

describe('Object validation', () => {
  it('should not throw error if all required keys are present', () => {
    expect(
      () => Utils.hasRequiredKeys({
        requirements: {},
        nodeRef: {},
        someRequiredString: 'mystring',
        someOtherThingWhichIsNotRequired: ['a', 'b', 'c'],
      }, ['requirements', 'nodeRef', 'someRequiredString']),
    ).not.toThrowError();
  });

  it('should throw error is required keys are missing', () => {
    expect(
      () => Utils.hasRequiredKeys({
        someOtherThingWhichIsNotRequired: ['a', 'b', 'c'],
      }, ['requirements', 'nodeRef']),
    ).toThrowError();
  });
});
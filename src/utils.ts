/**
 * Utils should only contain static methods.
 */
export class Utils {
  /**
   * Check whether a string conforms to the lowercase RFC 1123. If not, Kubernetes will throw
   * an error saying that the name must conform with regex used for validation, which is:
   * \'[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*\')\n'
   *
   * @param s string to validate
   *
   * @returns boolean
   */
  public static validateKubernetesNameConformance(s: string): boolean {
    let regex = new RegExp('^(?![0-9]+$)(?!.*-$)(?!-)[a-z0-9-]{1,63}$');
    return regex.test(s);
  }

  /**
   * Checks the object to ensure that all required keys are present, or throws an error.
   *
   * @param obj object to check
   * @param required list of strings to ensure presence
   *
   * @returns boolean
   */
  public static hasRequiredKeys(obj: Record<string, any>, required: string[]): void {
    for (let key of required) {
      if (!obj.hasOwnProperty(key)) {
        throw new Error(`Missing required key: ${key}, full object: ${JSON.stringify(obj)}`);
      }
    }
  }
}

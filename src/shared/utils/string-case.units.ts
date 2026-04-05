export class StringCaseUtils {
  static upper(str: string): string {
    return str.toUpperCase();
  }

  static lower(str: string): string {
    return str.toLowerCase();
  }

  static titleCase(str: string): string {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  static camel(str: string): string {
    const words = str.toLowerCase().split(' ');
    return words
      .map((word, index) =>
        index === 0
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1),
      )
      .join('');
  }

  static pascal(str: string): string {
    return str
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  static snake(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
  }

  static kebab(str: string): string {
    return str
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-');
  }
}
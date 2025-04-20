/**
 * Checks if a name matches any of the specified patterns
 * @param {string} name - The name to check against patterns
 * @param {string[]} patterns - Array of pattern strings to match
 * @returns {boolean} - True if the name matches any pattern, false otherwise
 */
export function matchPatterns(name, patterns) {
  if (!name) return false;
  const lowerCaseName = name.toLowerCase();
  return patterns.some((p) => lowerCaseName.includes(p));
} 
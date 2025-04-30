/**
 * Checks if a name matches any of the specified patterns
 * @param {string} name - The name to check against patterns
 * @param {string[]} patterns - Array of pattern strings to match
 * @param {Object} options - Additional options for pattern matching
 * @param {boolean} options.wordBoundary - Whether to match whole words only (default: true)
 * @returns {boolean} - True if the name matches any pattern, false otherwise
 */
export function matchPatterns(name, patterns, options = { wordBoundary: true }) {
  if (!name || !patterns) return false;
  const lowerCaseName = name.toLowerCase();
  
  if (options.wordBoundary) {
    // Split the name into words, handling common separators
    const words = lowerCaseName.split(/[_\s-]/);
    return patterns.some(pattern => {
      const patternLower = pattern.toLowerCase();
      return words.some(word => word === patternLower);
    });
  }
  
  return patterns.some(pattern => lowerCaseName.includes(pattern.toLowerCase()));
}

/**
 * Determines the category of a header based on its name
 * @param {string} name - The header name to categorize
 * @param {Object} categories - Category definitions with patterns
 * @returns {Object} - Category match information { category: string, threshold: number }
 */
export function categorizeHeader(name, categories) {
  if (!name) return null;
  
  for (const [category, config] of Object.entries(categories)) {
    // For pressure category, check negative patterns first
    if (category === 'pressure') {
      // If matches any negative pattern, skip this header
      if (config.negativePatterns && matchPatterns(name, config.negativePatterns)) {
        continue;
      }
    }
    
    // Check positive patterns
    if (matchPatterns(name, config.patterns)) {
      return {
        category,
        threshold: config.threshold
      };
    }
  }
  
  return null;
}

/**
 * Checks if a value breaches the threshold for its category
 * @param {number} value - The current value to check
 * @param {Object} categoryInfo - Category information from categorizeHeader
 * @returns {boolean} - True if the value breaches the threshold
 */
export function checkCategoryThreshold(value, categoryInfo) {
  if (!categoryInfo || value === null || value === undefined) return false;
  
  const { category, threshold } = categoryInfo;
  if (threshold === null || threshold === undefined) return false;
  
  // For battery, alert when below threshold
  if (category === 'battery') {
    return value < threshold;
  }
  
  // For other categories, use the threshold as is
  return value < threshold;
} 
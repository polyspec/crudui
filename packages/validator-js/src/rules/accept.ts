/**
 * Accept validation rule
 *
 * Validates that a file has an acceptable MIME type or extension
 */

import { RuleDefinition, ValidationContext } from '../types';
import { isEmpty } from './required';

/**
 * Common MIME type mappings
 */
const EXTENSION_TO_MIME: Record<string, string[]> = {
  // Images
  'jpg': ['image/jpeg'],
  'jpeg': ['image/jpeg'],
  'png': ['image/png'],
  'gif': ['image/gif'],
  'webp': ['image/webp'],
  'svg': ['image/svg+xml'],
  'bmp': ['image/bmp'],
  'ico': ['image/x-icon', 'image/vnd.microsoft.icon'],

  // Documents
  'pdf': ['application/pdf'],
  'doc': ['application/msword'],
  'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'xls': ['application/vnd.ms-excel'],
  'xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  'ppt': ['application/vnd.ms-powerpoint'],
  'pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  'txt': ['text/plain'],
  'csv': ['text/csv', 'application/csv'],

  // Audio
  'mp3': ['audio/mpeg', 'audio/mp3'],
  'wav': ['audio/wav', 'audio/x-wav'],
  'ogg': ['audio/ogg'],
  'flac': ['audio/flac'],

  // Video
  'mp4': ['video/mp4'],
  'webm': ['video/webm'],
  'avi': ['video/x-msvideo'],
  'mov': ['video/quicktime'],
  'mkv': ['video/x-matroska'],

  // Archives
  'zip': ['application/zip', 'application/x-zip-compressed'],
  'rar': ['application/x-rar-compressed', 'application/vnd.rar'],
  'tar': ['application/x-tar'],
  'gz': ['application/gzip'],
  '7z': ['application/x-7z-compressed'],

  // Code
  'json': ['application/json'],
  'xml': ['application/xml', 'text/xml'],
  'html': ['text/html'],
  'css': ['text/css'],
  'js': ['application/javascript', 'text/javascript'],
};

/**
 * Parse accept parameter into a list of allowed MIME types
 */
export function parseAcceptParam(param: unknown): string[] {
  const acceptList: string[] = [];

  if (typeof param === 'string') {
    // Split by comma
    const parts = param.split(',').map(p => p.trim().toLowerCase());
    for (const part of parts) {
      if (part.startsWith('.')) {
        // Extension (e.g., .jpg)
        const ext = part.slice(1);
        const mimes = EXTENSION_TO_MIME[ext];
        if (mimes) {
          acceptList.push(...mimes);
        } else {
          // Unknown extension, add as-is pattern
          acceptList.push(part);
        }
      } else if (part.includes('/')) {
        // MIME type (e.g., image/jpeg or image/*)
        acceptList.push(part);
      }
    }
  } else if (Array.isArray(param)) {
    for (const item of param) {
      acceptList.push(...parseAcceptParam(item));
    }
  }

  return acceptList;
}

/**
 * Check if a MIME type matches the accept list
 */
export function matchesMimeType(mimeType: string, acceptList: string[]): boolean {
  const normalizedMime = mimeType.toLowerCase();

  for (const accept of acceptList) {
    if (accept === '*/*') {
      return true;
    }

    if (accept.endsWith('/*')) {
      // Wildcard type (e.g., image/*)
      const typePrefix = accept.slice(0, -1); // Remove *
      if (normalizedMime.startsWith(typePrefix)) {
        return true;
      }
    } else if (accept.startsWith('.')) {
      // Extension check - need to extract extension from filename
      continue; // This is handled separately
    } else if (normalizedMime === accept) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a file extension matches the accept list
 */
export function matchesExtension(filename: string, acceptList: string[]): boolean {
  const ext = filename.toLowerCase().split('.').pop();
  if (!ext) {
    return false;
  }

  for (const accept of acceptList) {
    if (accept.startsWith('.')) {
      if (accept.slice(1) === ext) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Accept rule definition
 */
export const acceptRule: RuleDefinition = {
  validate(context: ValidationContext): string | null {
    const { value, ruleParam, messages } = context;

    // Skip if no rule param
    if (ruleParam === null || ruleParam === undefined || ruleParam === false) {
      return null;
    }

    // Skip validation if value is empty (required rule handles this)
    if (isEmpty(value)) {
      return null;
    }

    const acceptList = parseAcceptParam(ruleParam);
    if (acceptList.length === 0) {
      return null;
    }

    // Handle File object (browser environment)
    if (typeof File !== 'undefined' && value instanceof File) {
      const file = value as File;

      // Check MIME type
      if (file.type && matchesMimeType(file.type, acceptList)) {
        return null;
      }

      // Check extension
      if (file.name && matchesExtension(file.name, acceptList)) {
        return null;
      }

      return messages?.accept ?? 'Please upload a file with a valid format.';
    }

    // Handle FileList
    if (typeof FileList !== 'undefined' && value instanceof FileList) {
      for (let i = 0; i < value.length; i++) {
        const file = value[i];
        const isValid =
          (file.type && matchesMimeType(file.type, acceptList)) ||
          (file.name && matchesExtension(file.name, acceptList));

        if (!isValid) {
          return messages?.accept ?? 'Please upload files with valid formats.';
        }
      }
      return null;
    }

    // Handle array of files (React, etc.)
    if (Array.isArray(value)) {
      for (const file of value) {
        if (typeof file === 'object' && file !== null) {
          const mimeType = file.type || file.mimeType || '';
          const filename = file.name || file.filename || '';

          const isValid =
            (mimeType && matchesMimeType(mimeType, acceptList)) ||
            (filename && matchesExtension(filename, acceptList));

          if (!isValid) {
            return messages?.accept ?? 'Please upload files with valid formats.';
          }
        }
      }
      return null;
    }

    // Handle string (filename or MIME type)
    if (typeof value === 'string') {
      if (value.includes('/')) {
        // MIME type string
        if (!matchesMimeType(value, acceptList)) {
          return messages?.accept ?? 'Please upload a file with a valid format.';
        }
      } else {
        // Filename string
        if (!matchesExtension(value, acceptList)) {
          return messages?.accept ?? 'Please upload a file with a valid format.';
        }
      }
      return null;
    }

    // Handle object with type/name properties
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      const mimeType = (obj.type || obj.mimeType || '') as string;
      const filename = (obj.name || obj.filename || '') as string;

      const isValid =
        (mimeType && matchesMimeType(mimeType, acceptList)) ||
        (filename && matchesExtension(filename, acceptList));

      if (!isValid) {
        return messages?.accept ?? 'Please upload a file with a valid format.';
      }
    }

    return null;
  },

  defaultMessage: 'Please upload a file with a valid format.',
};

export default acceptRule;

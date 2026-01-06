/**
 * GeometryField Component
 *
 * Geometry/coordinate input field for GIS data
 * Supports Point, LineString, Polygon, etc.
 */

import React, { useCallback, useState, useMemo, type ChangeEvent } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiPoint' | 'MultiLineString' | 'MultiPolygon';

interface GeoJSONGeometry {
  type: GeometryType;
  coordinates: unknown;
}

/**
 * GeometryField component
 */
export function GeometryField({
  name,
  spec,
  value,
  onChange,
  onBlur,
  error,
  disabled,
  readonly,
  path,
  language,
}: FieldComponentProps) {
  const { t } = useI18n();
  const [editMode, setEditMode] = useState<'visual' | 'raw'>('visual');

  // Parse current geometry
  const geometry: GeoJSONGeometry | null = useMemo(() => {
    if (!value) return null;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as unknown as GeoJSONGeometry;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }

    return null;
  }, [value]);

  // Geometry type from spec or detected
  const geometryType: GeometryType = (spec.geometry_type as GeometryType) ?? geometry?.type ?? 'Point';

  // Parse point coordinates
  const pointCoords = useMemo(() => {
    if (!geometry || geometry.type !== 'Point') {
      return { lat: '', lng: '' };
    }
    const coords = geometry.coordinates as [number, number];
    return {
      lng: coords[0]?.toString() ?? '',
      lat: coords[1]?.toString() ?? '',
    };
  }, [geometry]);

  // Handle point coordinate change
  const handlePointChange = useCallback(
    (coord: 'lat' | 'lng', val: string) => {
      const lng = coord === 'lng' ? parseFloat(val) || 0 : parseFloat(pointCoords.lng) || 0;
      const lat = coord === 'lat' ? parseFloat(val) || 0 : parseFloat(pointCoords.lat) || 0;

      const newGeometry: GeoJSONGeometry = {
        type: 'Point',
        coordinates: [lng, lat],
      };

      onChange(newGeometry as unknown as FormValue);
    },
    [onChange, pointCoords]
  );

  // Handle raw JSON change
  const handleRawChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      try {
        const parsed = JSON.parse(val);
        if (parsed.type && parsed.coordinates) {
          onChange(parsed as FormValue);
        }
      } catch {
        // Keep invalid JSON as string for editing
        onChange(val);
      }
    },
    [onChange]
  );

  // Clear geometry
  const handleClear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  // Format coordinates for display
  const formatCoordinates = useCallback((coords: unknown): string => {
    if (Array.isArray(coords)) {
      if (typeof coords[0] === 'number') {
        // Simple coordinate pair
        return `[${coords.join(', ')}]`;
      }
      // Nested coordinates
      return `[${coords.map((c) => formatCoordinates(c)).join(', ')}]`;
    }
    return String(coords);
  }, []);

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className={`form-geometry ${error ? 'is-invalid' : ''}`}>
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      {/* Mode toggle */}
      <div className="btn-group mb-2" role="group">
        <button
          type="button"
          className={`btn btn-sm ${editMode === 'visual' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setEditMode('visual')}
          disabled={disabled}
        >
          {t('visual') || 'Visual'}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${editMode === 'raw' ? 'btn-primary' : 'btn-outline-primary'}`}
          onClick={() => setEditMode('raw')}
          disabled={disabled}
        >
          {t('raw') || 'Raw GeoJSON'}
        </button>
      </div>

      {/* Visual editor */}
      {editMode === 'visual' && (
        <div className="form-geometry-visual">
          {/* Geometry type selector */}
          <div className="mb-2">
            <label className="form-label">
              {t('geometry_type') || 'Type'}:
            </label>
            <select
              className="valid-target form-control form-select"
              value={geometry?.type ?? geometryType}
              onChange={(e) => {
                const newType = e.target.value as GeometryType;
                let newCoords: unknown;

                switch (newType) {
                  case 'Point':
                    newCoords = [0, 0];
                    break;
                  case 'LineString':
                    newCoords = [[0, 0], [1, 1]];
                    break;
                  case 'Polygon':
                    newCoords = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];
                    break;
                  default:
                    newCoords = [];
                }

                onChange({ type: newType, coordinates: newCoords } as unknown as FormValue);
              }}
              disabled={disabled || readonly}
            >
              <option value="Point">Point</option>
              <option value="LineString">LineString</option>
              <option value="Polygon">Polygon</option>
              <option value="MultiPoint">MultiPoint</option>
              <option value="MultiLineString">MultiLineString</option>
              <option value="MultiPolygon">MultiPolygon</option>
            </select>
          </div>

          {/* Point editor */}
          {(geometry?.type === 'Point' || (!geometry && geometryType === 'Point')) && (
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label">
                  {t('latitude') || 'Latitude'}:
                </label>
                <input
                  type="number"
                  step="any"
                  className="valid-target form-control"
                  value={pointCoords.lat}
                  onChange={(e) => handlePointChange('lat', e.target.value)}
                  disabled={disabled}
                  readOnly={readonly}
                  placeholder="-90 to 90"
                />
              </div>
              <div className="col-6">
                <label className="form-label">
                  {t('longitude') || 'Longitude'}:
                </label>
                <input
                  type="number"
                  step="any"
                  className="valid-target form-control"
                  value={pointCoords.lng}
                  onChange={(e) => handlePointChange('lng', e.target.value)}
                  disabled={disabled}
                  readOnly={readonly}
                  placeholder="-180 to 180"
                />
              </div>
            </div>
          )}

          {/* Complex geometry display */}
          {geometry && geometry.type !== 'Point' && (
            <div className="form-geometry-complex">
              <label className="form-label">
                {t('coordinates') || 'Coordinates'}:
              </label>
              <pre className="bg-light p-2 rounded small">
                {formatCoordinates(geometry.coordinates)}
              </pre>
              <div className="text-muted small">
                {t('edit_in_raw_mode') || 'Edit complex geometries in Raw mode'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw JSON editor */}
      {editMode === 'raw' && (
        <div className="form-geometry-raw">
          <textarea
            className="valid-target form-control font-monospace"
            value={geometry ? JSON.stringify(geometry, null, 2) : ''}
            onChange={handleRawChange}
            onBlur={onBlur}
            disabled={disabled}
            readOnly={readonly}
            placeholder='{"type": "Point", "coordinates": [0, 0]}'
            rows={8}
          />
        </div>
      )}

      {/* Hidden input for form */}
      <input
        type="hidden"
        name={bracketName}
        value={geometry ? JSON.stringify(geometry) : ''}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* Clear button */}
      {geometry && !disabled && !readonly && (
        <button
          type="button"
          className="btn btn-sm btn-outline-danger mt-2"
          onClick={handleClear}
        >
          {t('clear') || 'Clear'}
        </button>
      )}

      {/* Append */}
      {spec.append && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.append }}
        />
      )}
    </div>
  );
}

export default GeometryField;

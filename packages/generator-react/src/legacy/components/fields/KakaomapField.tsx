/**
 * KakaomapField Component
 *
 * Kakao Map integration for location selection
 * Requires Kakao Maps JavaScript SDK to be loaded
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import type { FieldComponentProps, FormValue } from '../../types';
import { useI18n } from '../../context/I18nContext';
import { getLimepieDataAttributes, toBracketNotation } from '../../utils/dataAttributes';

interface MapLocation {
  lat: number;
  lng: number;
  address?: string;
  roadAddress?: string;
  placeName?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        Map: new (container: HTMLElement, options: unknown) => KakaoMap;
        LatLng: new (lat: number, lng: number) => KakaoLatLng;
        Marker: new (options: unknown) => KakaoMarker;
        services: {
          Geocoder: new () => KakaoGeocoder;
        };
        event: {
          addListener: (target: unknown, type: string, callback: (e: unknown) => void) => void;
        };
      };
    };
  }
}

interface KakaoMap {
  setCenter: (latlng: KakaoLatLng) => void;
  getCenter: () => KakaoLatLng;
}

interface KakaoLatLng {
  getLat: () => number;
  getLng: () => number;
}

interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void;
  setPosition: (latlng: KakaoLatLng) => void;
  getPosition: () => KakaoLatLng;
}

interface KakaoGeocoder {
  coord2Address: (lng: number, lat: number, callback: (result: unknown[], status: string) => void) => void;
}

/**
 * KakaomapField component
 */
export function KakaomapField({
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
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<KakaoMap | null>(null);
  const markerRef = useRef<KakaoMarker | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Parse current location
  const currentLocation: MapLocation | null = typeof value === 'object' && value !== null
    ? value as MapLocation
    : null;

  // Default center (Seoul)
  const defaultLat = (spec.default_lat as number) ?? 37.5665;
  const defaultLng = (spec.default_lng as number) ?? 126.978;
  const defaultZoom = (spec.zoom as number) ?? 3;

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) {
      // Kakao SDK not loaded
      setIsLoaded(false);
      return;
    }

    window.kakao.maps.load(() => {
      if (!mapRef.current) return;

      const centerLat = currentLocation?.lat ?? defaultLat;
      const centerLng = currentLocation?.lng ?? defaultLng;

      const options = {
        center: new window.kakao!.maps.LatLng(centerLat, centerLng),
        level: defaultZoom,
      };

      const map = new window.kakao!.maps.Map(mapRef.current, options);
      mapInstanceRef.current = map;

      // Create marker
      const marker = new window.kakao!.maps.Marker({
        position: new window.kakao!.maps.LatLng(centerLat, centerLng),
        map: map,
      });
      markerRef.current = marker;

      // Click event to set location
      if (!disabled && !readonly) {
        window.kakao!.maps.event.addListener(map, 'click', (mouseEvent: unknown) => {
          const latlng = (mouseEvent as { latLng: KakaoLatLng }).latLng;
          marker.setPosition(latlng);

          // Reverse geocode
          const geocoder = new window.kakao!.maps.services.Geocoder();
          geocoder.coord2Address(latlng.getLng(), latlng.getLat(), (result: unknown[], status: string) => {
            let address = '';
            let roadAddress = '';

            if (status === 'OK' && result[0]) {
              const item = result[0] as { address?: { address_name: string }; road_address?: { address_name: string } };
              address = item.address?.address_name ?? '';
              roadAddress = item.road_address?.address_name ?? '';
            }

            const locationData: MapLocation = {
              lat: latlng.getLat(),
              lng: latlng.getLng(),
              address,
              roadAddress,
            };

            onChange(locationData as unknown as FormValue);
          });
        });
      }

      setIsLoaded(true);
    });

    return () => {
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [disabled, readonly, defaultLat, defaultLng, defaultZoom]);

  // Update marker when value changes
  useEffect(() => {
    if (!mapInstanceRef.current || !markerRef.current || !currentLocation) return;

    const latlng = new window.kakao!.maps.LatLng(currentLocation.lat, currentLocation.lng);
    markerRef.current.setPosition(latlng);
    mapInstanceRef.current.setCenter(latlng);
  }, [currentLocation?.lat, currentLocation?.lng]);

  // Clear location
  const handleClear = useCallback(() => {
    onChange(null);
    if (markerRef.current && mapInstanceRef.current) {
      const defaultLatLng = new window.kakao!.maps.LatLng(defaultLat, defaultLng);
      markerRef.current.setPosition(defaultLatLng);
      mapInstanceRef.current.setCenter(defaultLatLng);
    }
  }, [onChange, defaultLat, defaultLng]);

  const mapHeight = (spec.height as string) ?? '300px';

  // Convert path to bracket notation for name attribute
  const bracketName = toBracketNotation(path);

  return (
    <div className={`form-kakaomap ${error ? 'is-invalid' : ''}`}>
      {/* Prepend */}
      {spec.prepend && (
        <span
          className="input-group-text"
          dangerouslySetInnerHTML={{ __html: spec.prepend }}
        />
      )}

      {/* SDK not loaded notice */}
      {!window.kakao?.maps && (
        <div className="alert alert-warning">
          {t('kakaomap_sdk_required') || 'Kakao Maps SDK is required. Please load the SDK script.'}
        </div>
      )}

      {/* Map container */}
      <div
        ref={mapRef}
        className="form-kakaomap-map rounded"
        style={{ height: mapHeight }}
      />

      {/* Hidden input for form */}
      <input
        type="hidden"
        name={bracketName}
        value={currentLocation ? JSON.stringify(currentLocation) : ''}
        onBlur={onBlur}
        {...getLimepieDataAttributes(spec, path, language)}
      />

      {/* Location info */}
      {currentLocation && (
        <div className="form-kakaomap-info mt-2 p-2 bg-light rounded">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <div className="small">
                <strong>Lat:</strong> {currentLocation.lat.toFixed(6)}
                <span className="mx-2">|</span>
                <strong>Lng:</strong> {currentLocation.lng.toFixed(6)}
              </div>
              {currentLocation.roadAddress && (
                <div className="text-muted small">{currentLocation.roadAddress}</div>
              )}
              {currentLocation.address && !currentLocation.roadAddress && (
                <div className="text-muted small">{currentLocation.address}</div>
              )}
            </div>
            {!disabled && !readonly && (
              <button
                type="button"
                className="btn btn-sm btn-outline-danger"
                onClick={handleClear}
                aria-label={t('remove')}
              >
                {t('clear') || 'Clear'}
              </button>
            )}
          </div>
        </div>
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

export default KakaomapField;

import './renderers.css';
import { ExternalIcon, MapPinIcon } from '../ui/icons';

export interface LocationProps {
  latitude: number;
  longitude: number;
  name?: string | undefined;
  address?: string | undefined;
}

export function LocationMessage({ latitude, longitude, name, address }: LocationProps) {
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude);
  const coordinates = `${latitude}, ${longitude}`;
  return (
    <div className="location">
      <div className="location__map" aria-hidden="true">
        <MapPinIcon className="location__pin" />
      </div>
      <div className="location__text">
        <strong className="location__name">{name ?? coordinates}</strong>
        {address ? <span className="location__address">{address}</span> : null}
      </div>
      {valid ? (
        <a
          className="location__open"
          href={`https://www.google.com/maps?q=${latitude},${longitude}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalIcon /> Abrir no mapa
        </a>
      ) : null}
    </div>
  );
}

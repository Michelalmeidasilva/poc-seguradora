import { useRef, useState } from 'react';
import { FieldMessages, groupBlur, prop, useField } from './field';

type Props = Record<string, unknown>;

export interface UploadedFile {
  media_id: string;
  file_name: string;
}

/**
 * The only place that mints media ids. The gateway has no upload endpoint yet, so ids are
 * local and no bytes leave the browser; a future `/v1/media` upload replaces this function.
 */
export function newMediaId(): string {
  return `local-${crypto.randomUUID()}`;
}

const count = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;

const isUploaded = (v: unknown): v is UploadedFile =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as UploadedFile).media_id === 'string' &&
  typeof (v as UploadedFile).file_name === 'string';

function mimeList(c: Props, kind: 'photos' | 'documents'): string[] | undefined {
  if (kind === 'photos') return ['image/*'];
  const raw = prop(c, 'allowed-mime-types');
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : [];
  const out = list.filter((m): m is string => typeof m === 'string').map((m) => m.trim());
  return out.filter(Boolean).length > 0 ? out.filter(Boolean) : undefined;
}

const mimeAllowed = (type: string, allowed: string[] | undefined): boolean =>
  allowed === undefined ||
  allowed.some((a) => (a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : a === type));

function MediaPicker({ c, kind }: { c: Props; kind: 'photos' | 'documents' }) {
  const f = useField(c);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejection, setRejection] = useState<string>();
  const [announce, setAnnounce] = useState('');

  const files = Array.isArray(f.value) ? f.value.filter(isUploaded) : [];
  const max = count(prop(c, `max-uploaded-${kind}`));
  const maxKb = count(prop(c, 'max-file-size-kb'));
  const allowed = mimeList(c, kind);
  const source = prop(c, 'photo-source');
  const capture = kind === 'photos' && source === 'camera';
  const custom = f.text(prop(c, 'error-message'));
  const description = f.text(prop(c, 'description'));
  const descId = `${f.controlId}-desc`;
  const noun = kind === 'photos' ? 'fotos' : 'documentos';

  const reject = (msg: string) => {
    setRejection(custom || msg);
    setAnnounce(`Erro: ${custom || msg}`);
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    const next = [...files];
    const added: string[] = [];
    let error: string | undefined;
    for (const file of picked) {
      if (!mimeAllowed(file.type, allowed)) {
        error = `${file.name} não é um tipo de arquivo permitido`;
      } else if (maxKb !== undefined && file.size > maxKb * 1024) {
        error = `${file.name} excede o limite de ${maxKb} KB`;
      } else if (max !== undefined && next.length >= max) {
        error = `Máximo de ${max} ${max === 1 ? 'arquivo' : 'arquivos'}`;
      } else {
        next.push({ media_id: newMediaId(), file_name: file.name });
        added.push(file.name);
      }
    }
    if (error) reject(error);
    else {
      setRejection(undefined);
      setAnnounce(added.map((n) => `${n} adicionado`).join('. '));
    }
    if (added.length > 0) f.set(next);
    f.touch();
  };

  const remove = (id: string) => {
    const gone = files.find((x) => x.media_id === id);
    f.set(files.filter((x) => x.media_id !== id));
    setRejection(undefined);
    if (gone) setAnnounce(`${gone.file_name} removido`);
    f.touch();
  };

  const describedBy =
    [description ? descId : '', f.describedBy ?? ''].filter(Boolean).join(' ') || undefined;
  const full = max !== undefined && files.length >= max;

  return (
    <div className="flow-field flow-media" data-flow-field={f.name} onBlur={groupBlur(f.touch)}>
      <label htmlFor={f.controlId} className="flow-field__label">
        {f.label}
      </label>
      {description && (
        <p id={descId} className="flow-field__helper">
          {description}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        className="flow-media__input"
        tabIndex={-1}
        aria-hidden="true"
        multiple={max !== 1}
        accept={allowed?.join(',')}
        {...(capture ? { capture: 'environment' } : {})}
        disabled={f.disabled}
        onChange={onPick}
      />
      <button
        type="button"
        id={f.controlId}
        className="flow-media__button"
        disabled={f.disabled || full}
        aria-describedby={describedBy}
        aria-invalid={f.error ? true : undefined}
        onClick={() => inputRef.current?.click()}
      >
        {capture ? 'Tirar foto' : `Adicionar ${noun}`}
      </button>
      {files.length > 0 && (
        <ul className="flow-media__list">
          {files.map((x) => (
            <li key={x.media_id} className="flow-media__item">
              <span className="flow-media__name">{x.file_name}</span>
              <button
                type="button"
                className="flow-media__remove"
                disabled={f.disabled}
                onClick={() => remove(x.media_id)}
              >
                <span aria-hidden="true">×</span>
                <span className="flow-media__sr">Remover {x.file_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {rejection && <p className="flow-field__error">{rejection}</p>}
      <FieldMessages f={f} />
      <div role="status" className="flow-media__sr">
        {announce}
      </div>
    </div>
  );
}

export function PhotoPicker({ c }: { c: Props }) {
  return <MediaPicker c={c} kind="photos" />;
}

export function DocumentPicker({ c }: { c: Props }) {
  return <MediaPicker c={c} kind="documents" />;
}

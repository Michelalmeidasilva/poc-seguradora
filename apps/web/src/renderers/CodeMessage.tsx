import './renderers.css';
import { useState } from 'react';
import { CopyIcon } from '../ui/icons';

export function CodeMessage({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (!navigator.clipboard) return;
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the text can still be selected manually
    }
  };

  return (
    <div className="code">
      <div className="code__bar">
        {language ? <span className="code__lang">{language}</span> : <span />}
        <button type="button" className="code__copy" onClick={copy}>
          <CopyIcon /> {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="code__body">
        <code>{code}</code>
      </pre>
    </div>
  );
}

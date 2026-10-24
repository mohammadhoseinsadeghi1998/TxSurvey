from pathlib import Path
root = Path(__file__).resolve().parent.parent
content = '\n'.join((root / name).read_text(encoding='utf-8').rstrip() for name in ('topics.js', 'schema.js')) + '\n'
(root / 'google-apps-script' / 'Code.gs').write_text(content, encoding='utf-8')
print('Updated google-apps-script/Code.gs; redeploy the Apps Script web app after copying it.')

"""Create the end-user ZIP from canonical app files; never includes task data."""
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
target = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'output/chronos.zip'
target.parent.mkdir(parents=True, exist_ok=True)
with TemporaryDirectory(prefix='chronos-package-') as temporary:
    html = Path(temporary) / 'chronos.html'
    subprocess.run(['node', str(root / 'tools/build-standalone.mjs'), str(html)], cwd=root, check=True)
    entries = {'chronos.html': html, 'LICENSE': root / 'LICENSE',
               'START.md': root / 'release/START.md', 'START.ru.md': root / 'release/START.ru.md'}
    for folder, pattern in [('themes', '*.css'), ('locales', '*.locale.js')]:
        for source in sorted((root / 'chronos-2.0' / folder).glob(pattern)):
            entries[f'{folder}/{source.name}'] = source
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, source in sorted(entries.items()):
            if source.is_symlink() or not source.is_file():
                raise ValueError(f'Expected a regular release file: {name}')
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())
print(target)

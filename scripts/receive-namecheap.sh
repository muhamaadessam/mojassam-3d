#!/usr/bin/env bash
# Forced SSH command: only an authenticated release upload is accepted, never a shell.
set -euo pipefail
umask 077
sha=${SSH_ORIGINAL_COMMAND:-}
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { printf 'Only a release commit is accepted\n' >&2; exit 1; }
releases=/home/konobbue/mojassam-releases
mkdir -p "$releases"
exec 8>/home/konobbue/mojassam-ci/receive.lock
flock -w 300 8
incoming="$releases/$sha.incoming"
trap 'rm -f "$incoming"' EXIT
head -c 104857601 > "$incoming"
[[ $(wc -c < "$incoming") -le 104857600 ]] || { printf 'Release exceeds 100 MiB\n' >&2; exit 1; }
python3 - "$incoming" <<'PY'
import posixpath, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    members = archive.getmembers()
    if len(members) > 20000:
        raise ValueError('Too many archive members')
    for member in members:
        name = posixpath.normpath(member.name)
        if name.startswith('/') or name == '..' or name.startswith('../'):
            raise ValueError('Unsafe archive path')
        if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
            raise ValueError('Unsupported archive member')
        if member.issym() or member.islnk():
            target = posixpath.normpath(posixpath.join(posixpath.dirname(name), member.linkname) if member.issym() else member.linkname)
            if target.startswith('/') or target == '..' or target.startswith('../'):
                raise ValueError('Unsafe archive link')
PY
mv "$incoming" "$releases/$sha.tar.gz"
exec bash /home/konobbue/mojassam-ci/deploy-namecheap.sh "$sha"

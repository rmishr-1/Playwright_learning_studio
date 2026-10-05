"""Writes openapi.yaml into swagger.html, so the page works when opened straight from disk
(a browser does not let a file:// page fetch the file beside it). Run after changing openapi.yaml:

    python3 docs/security/embed-spec.py
"""
import pathlib, re

here = pathlib.Path(__file__).resolve().parent
spec = (here / 'openapi.yaml').read_text(encoding='utf-8')
if '</script' in spec.lower():
    raise SystemExit('openapi.yaml contains "</script", which would end the embedded copy early.')
page = (here / 'swagger.html').read_text(encoding='utf-8')
block = '<script type="text/plain" id="spec">\n' + spec + '</script>'
page, n = re.subn(r'<script type="text/plain" id="spec">.*?</script>', lambda m: block, page, flags=re.S)
if n != 1:
    raise SystemExit('swagger.html has no embedded-spec block to replace.')
(here / 'swagger.html').write_text(page, encoding='utf-8')
print('swagger.html now carries openapi.yaml (' + str(len(spec)) + ' characters).')

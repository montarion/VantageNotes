import re
import json

WIKILINK_RE = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')
HEADER_RE = re.compile(r'^(#{1,6})\s+(.*)', re.MULTILINE)
TASK_RE = re.compile(r'^- \[( |x|X)\] (.+)', re.MULTILINE)
TAG_RE = re.compile(r'#(\w+)')
LINK_RE = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
CODE_BLOCK_RE = re.compile(r'```(\w+)?\n(.*?)```', re.DOTALL)
IMAGE_RE = re.compile(r'!\[(.*?)\]\((.*?)\)')

def parse_markdown_file(filepath):
    with open(filepath, encoding='utf-8') as f:
        text = f.read()

    headers = []
    for m in HEADER_RE.finditer(text):
        level = len(m.group(1))
        header_text = m.group(2).strip()
        headers.append({'level': level, 'text': header_text})

    tasks = []
    for m in TASK_RE.finditer(text):
        checked = m.group(1).lower() == 'x'
        task_text = m.group(2).strip()
        tasks.append({'text': task_text, 'checked': checked})

    wikilinks = []
    for m in WIKILINK_RE.finditer(text):
        target = m.group(1)
        alias = m.group(2)
        wikilinks.append({'target': target, 'alias': alias})

    hyperlinks = []
    for m in LINK_RE.finditer(text):
        label = m.group(1)
        url = m.group(2)
        hyperlinks.append({'url': url, 'label': label})

    code_blocks = []
    for m in CODE_BLOCK_RE.finditer(text):
        lang = m.group(1) or 'plain'
        code_blocks.append({'language': lang})

    images = []
    for m in IMAGE_RE.finditer(text):
        alt_text = m.group(1)
        url = m.group(2)
        images.append({'alt_text': alt_text, 'url': url})

    tags_set = set(TAG_RE.findall(text))
    tags = [{'name': tag} for tag in sorted(tags_set)]

    metadata = {
        'tags': tags,
        'headers': headers,
        'tasks': tasks,
        'wikilinks': wikilinks,
        'hyperlinks': hyperlinks,
        'code_blocks': code_blocks,
        'images': images,
    }
    return metadata, text

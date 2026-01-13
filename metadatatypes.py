from typing import Dict, List, Optional, Any, Pattern
import re

class Header:
    regex: Pattern = re.compile(r'^(#{1,6})\s+(.*)')

    def __init__(self, level: int, text: str, line: int):
        self.level = level
        self.text = text
        self.line = line

    @classmethod
    def from_match(cls, m: re.Match, line_number: int):
        return cls(level=len(m.group(1)), text=m.group(2), line=line_number)


class Task:
    regex: Pattern = re.compile(r'^[-*] \[( |x|X)\] (.+)')

    def __init__(self, text: str, done: bool, line: int):
        self.text = text
        self.done = done
        self.line = line

    @classmethod
    def from_match(cls, m: re.Match, line_number: int):
        return cls(text=m.group(2), done=(m.group(1).lower() == "x"), line=line_number)


class Tag:
    regex: Pattern = re.compile(r'#(\w+)')

    def __init__(self, name: str, line: int, context: str):
        self.name = name
        self.line = line
        self.context = context

    @classmethod
    def from_match(cls, m: re.Match, line_number: int, line_text: str):
        return cls(name=m, line=line_number, context=line_text)


class Wikilink:
    regex: Pattern = re.compile(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]')

    def __init__(self, target: str, line: int, alias: Optional[str] = None, context: str = ""):
        self.target = target
        self.alias = alias
        self.line = line
        self.context = context

    @classmethod
    def from_match(cls, m: re.Match, line_number: int):
        target = m.group(1)
        alias = m.group(2) if m.lastindex >= 2 else None
        return cls(target=target, alias=alias, line=line_number, context=m.group(0))


class Hyperlink:
    regex: Pattern = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')

    def __init__(self, url: str, label: str, line: int, context: str):
        self.url = url
        self.label = label
        self.line = line
        self.context = context

    @classmethod
    def from_match(cls, m: re.Match, line_number: int):
        return cls(label=m.group(1), url=m.group(2), line=line_number, context=m.group(0))


class Imagelink:
    regex: Pattern = re.compile(r'!\[(.*?)\]\((.*?)\)')

    def __init__(self, url: str, alt_text: str, line: int, context: str):
        self.url = url
        self.alt_text = alt_text
        self.line = line
        self.context = context

    @classmethod
    def from_match(cls, m: re.Match, line_number: int):
        return cls(alt_text=m.group(1), url=m.group(2), line=line_number, context=m.group(0))


class CodeBlock:
    # handled separately since it's multiline
    def __init__(self, language: Optional[str], from_line: int, to_line: int, code: Optional[str] = None):
        self.language = language
        self.from_line = from_line
        self.to_line = to_line
        self.code = code


class PageMetadata:
    headers: List[Header]
    tasks: List[Task]
    tags: List[Tag]
    code_blocks: List[CodeBlock]
    wikilinks: List[Wikilink]
    hyperlinks: List[Hyperlink]
    images: List[Imagelink]
    backlinks: List[Wikilink]
    frontmatter: Optional[Dict[str, Any]]
    line_count: int
    text: str

    def __init__(self, text: str):
        self.text = text
        self.line_count = 0
        self.frontmatter = None
        self.headers = []
        self.tasks = []
        self.tags = []
        self.code_blocks = []
        self.wikilinks = []
        self.hyperlinks = []
        self.images = []
        self.backlinks = []

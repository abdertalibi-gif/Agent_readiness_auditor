import re
from dataclasses import dataclass, field


@dataclass
class FetchResult:
    url: str
    final_url: str
    status_code: int
    headers: dict[str, str]
    body: bytes
    elapsed_ms: int
    content_type: str | None = None
    redirect_chain: list[str] = field(default_factory=list)


@dataclass
class RobotsRule:
    allow: bool
    pattern: str


@dataclass
class RobotsTxt:
    rules: list[RobotsRule] = field(default_factory=list)
    sitemaps: list[str] = field(default_factory=list)
    fetched: bool = False
    url: str | None = None

    def can_fetch(self, path: str) -> bool:
        if not self.fetched or not self.rules:
            return True
        matched: RobotsRule | None = None
        for rule in self.rules:
            if _path_matches(path, rule.pattern):
                if matched is None or len(rule.pattern) > len(matched.pattern):
                    matched = rule
        return matched.allow if matched else True


def _path_matches(path: str, pattern: str) -> bool:
    if not pattern:
        return False
    if "*" not in pattern:
        return path.startswith(pattern)
    if pattern == "*":
        return True
    return re.match(_glob_to_regex(pattern), path) is not None


def _glob_to_regex(pattern: str) -> str:
    chunks = pattern.split("*")
    regex = "".join(re.escape(chunk) if i % 2 == 0 else ".*" for i, chunk in enumerate(chunks))
    return "^" + regex

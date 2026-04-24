import json
from pathlib import Path
from typing import Dict, Iterable, List


# ---------- Tag 配置文件路径 ----------
TAGS_FILE = Path("config") / "audio_tags.json"


# ---------- Tag 归一化与去重 ----------
def normalize_tags(raw_tags: Iterable[str]) -> List[str]:
    normalized: List[str] = []
    seen: set[str] = set()

    for raw_tag in raw_tags:
        tag = " ".join(str(raw_tag).strip().split())
        if not tag:
            continue

        dedupe_key = tag.casefold()
        if dedupe_key in seen:
            continue

        seen.add(dedupe_key)
        normalized.append(tag)

    return normalized


# ---------- 分类归一化与去重 ----------
def normalize_categories(raw_categories: Dict[str, Iterable[str]]) -> Dict[str, List[str]]:
    normalized: Dict[str, List[str]] = {}

    for raw_name, raw_tags in raw_categories.items():
        category_name = " ".join(str(raw_name).strip().split())
        if not category_name:
            continue

        tags = normalize_tags(raw_tags)
        if not tags:
            continue

        normalized[category_name] = tags

    if not normalized:
        raise ValueError("至少要保留一个有内容的 tag 分类")

    return normalized


# ---------- 展平分类标签 ----------
def flatten_categories(categories: Dict[str, Iterable[str]]) -> List[str]:
    flattened: List[str] = []

    for tags in categories.values():
        flattened.extend(tags)

    normalized = normalize_tags(flattened)
    if not normalized:
        raise ValueError("tags 不能为空")
    return normalized


# ---------- 确保配置目录存在 ----------
def _ensure_parent_dir() -> None:
    TAGS_FILE.parent.mkdir(parents=True, exist_ok=True)


# ---------- 读取本地 tag 配置 ----------
def load_tag_config() -> Dict[str, object]:
    _ensure_parent_dir()
    payload = json.loads(TAGS_FILE.read_text(encoding="utf-8"))

    categories = payload.get("categories")
    if isinstance(categories, dict):
        normalized_categories = normalize_categories(categories)
        return {
            "version": int(payload.get("version", 2)),
            "categories": normalized_categories,
        }

    raw_tags = payload.get("tags", [])
    if isinstance(raw_tags, list):
        normalized_tags = normalize_tags(raw_tags)
        if not normalized_tags:
            raise ValueError("tag 文件格式无效")
        return {
            "version": int(payload.get("version", 1)),
            "categories": {"general": normalized_tags},
        }

    raise ValueError("tag 文件格式无效")


# ---------- 读取全部可用 tags ----------
def load_tags() -> List[str]:
    config = load_tag_config()
    categories = config["categories"]
    return flatten_categories(categories)


# ---------- 保存本地 tag 配置 ----------
def save_tag_config(categories: Dict[str, Iterable[str]]) -> Dict[str, object]:
    normalized_categories = normalize_categories(categories)
    payload = {
        "version": 2,
        "categories": normalized_categories,
    }
    _ensure_parent_dir()
    TAGS_FILE.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return payload


# ---------- 兼容旧的 tags 保存入口 ----------
def save_tags(tags: Iterable[str]) -> List[str]:
    normalized = normalize_tags(tags)
    if not normalized:
        raise ValueError("tags 不能为空")
    save_tag_config({"general": normalized})
    return normalized

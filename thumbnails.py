"""Create compact offline portraits while preserving original source assets."""
from pathlib import Path
from PIL import Image
from concurrent.futures import ThreadPoolExecutor

target = Path('assets/thumbs')
target.mkdir(parents=True, exist_ok=True)
def convert(source):
    destination = target / (source.stem + '.webp')
    if destination.exists():
        return
    with Image.open(source) as image:
        image = image.convert('RGBA')
        image.thumbnail((256, 256), Image.Resampling.LANCZOS)
        image.save(destination, 'WEBP', quality=85, method=3)
with ThreadPoolExecutor(max_workers=8) as executor:
    list(executor.map(convert, Path('assets').glob('*.png')))
print(f'Generated {len(list(target.glob("*.webp")))} offline thumbnails')

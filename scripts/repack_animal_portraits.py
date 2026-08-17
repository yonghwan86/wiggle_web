from pathlib import Path
from PIL import Image


SOURCE = Path("public/brand/animal-portraits-v1.png")
TARGET = Path("public/brand/animal-portraits-v2.png")
CELL_SIZE = 512
SUBJECT_MAX_WIDTH = 350
SUBJECT_MAX_HEIGHT = 440

# The generated source is a 3:2 canvas, so equal 5x2 slices are tall rectangles.
# These boundaries follow the transparent gaps between the ten portraits.
COLUMNS = (
    ((0, 348), (348, 637), (637, 941), (941, 1243), (1243, 1536)),
    ((0, 348), (348, 625), (638, 941), (950, 1243), (1243, 1536)),
)
ROWS = ((80, 545), (580, 940))


source = Image.open(SOURCE).convert("RGBA")
sheet = Image.new("RGBA", (CELL_SIZE * 5, CELL_SIZE * 2), (0, 0, 0, 0))

for row_index, (top, bottom) in enumerate(ROWS):
    for column_index, (left, right) in enumerate(COLUMNS[row_index]):
        portrait = source.crop((left, top, right, bottom))
        alpha_bounds = portrait.getchannel("A").getbbox()
        if alpha_bounds is None:
            raise RuntimeError(f"Empty portrait at row {row_index}, column {column_index}")

        portrait = portrait.crop(alpha_bounds)
        scale = min(
            SUBJECT_MAX_WIDTH / portrait.width,
            SUBJECT_MAX_HEIGHT / portrait.height,
        )
        resized = portrait.resize(
            (round(portrait.width * scale), round(portrait.height * scale)),
            Image.Resampling.LANCZOS,
        )
        x = column_index * CELL_SIZE + (CELL_SIZE - resized.width) // 2
        y = row_index * CELL_SIZE + (CELL_SIZE - resized.height) // 2
        sheet.alpha_composite(resized, (x, y))

sheet.save(TARGET, optimize=True)
print(f"saved {TARGET} ({sheet.width}x{sheet.height})")

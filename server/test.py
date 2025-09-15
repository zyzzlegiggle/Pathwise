import pandas as pd

dataset_directory = r"./data/LinkedIn_Dataset.pcl"
dataset = pd.read_pickle(dataset_directory)

def is_non_empty(x):
    """Return True if value is not empty/NaN/None/object with no content."""
    if pd.isna(x):  # catches NaN, None, pd.NA
        return False
    if isinstance(x, str) and x.strip() == "":
        return False
    if isinstance(x, (list, dict, set, tuple)) and len(x) == 0:
        return False
    return True

# Find rows where ALL columns pass the non-empty check
mask = dataset.applymap(is_non_empty).all(axis=1)

# Filter dataset
complete_rows = dataset[mask]

if not complete_rows.empty:
    row = complete_rows.iloc[0]
    for col, val in row.items():
        print(f"{col}: {val}")
else:
    print("No row has all columns filled with non-empty values.")

import pandas as pd

dataset_directory = r"./data/LinkedIn_Dataset.pcl"
dataset = pd.read_pickle(dataset_directory)

# Get the first row (full details)
first_row = dataset.iloc[0]

# Print nicely
with pd.option_context('display.max_colwidth', None, 'display.max_columns', None):
    print(first_row)

# Derico Blicca Listingfilters

Listing filters for Plone Blicca: visitors narrow a listing by tags, other properties or a text search, with options from that listing's own results

## Features

- Compatible with Plone 6.2+

## Installation

Add `derico.blicca.listingfilters` to your project's dependencies:

```python
# In your pyproject.toml
dependencies = [
    "derico.blicca.listingfilters",
    # ...
]
```

Then activate the addon in your Plone site's control panel or via GenericSetup.

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/collective/derico.blicca.listingfilters.git
cd derico.blicca.listingfilters

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install in development mode
pip install -e ".[test]"
```

### Running Tests

```bash
pytest
```

### Running Tests with Coverage

```bash
pytest --cov=derico.blicca.listingfilters --cov-report=html
```

## License

GPL-2.0-or-later

## Author

Maik Derstappen <md@derico.de>

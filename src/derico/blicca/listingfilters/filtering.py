"""What a filter leaves and offers, on plain data."""


def narrow(entries, allow_lists, chosen, text_matches=None):
    """Return ``(results, options, selected)`` for ``(key, {field: values})`` entries."""
    entries = list(entries)
    occurring = {field: set() for field in allow_lists}
    for _key, values in entries:
        for field in occurring:
            occurring[field] |= values[field]

    options = {}
    selected = {}
    for field, allow_list in allow_lists.items():
        allowed = occurring[field] & set(allow_list) if allow_list else occurring[field]
        selected[field] = allowed & set(chosen.get(field, ()))
        # Even when it finds nothing, so a visitor can deselect it.
        options[field] = set(selected[field])

    results = []
    for key, values in entries:
        if text_matches is not None and key not in text_matches:
            continue
        misses = [
            field for field, picked in selected.items() if picked and not picked & values[field]
        ]
        if not misses:
            results.append(key)
        # Values of one filter widen and different filters narrow, so a filter
        # ignores its own selection when listing its options.
        for field, allow_list in allow_lists.items():
            if not misses or misses == [field]:
                offered = values[field] & set(allow_list) if allow_list else values[field]
                options[field] |= offered
    return results, options, selected


def ordered_options(titles, allow_list):
    """An allow list sets the order, otherwise alphabetical by title."""
    if allow_list:
        return [value for value in allow_list if value in titles]
    return sorted(titles, key=lambda value: titles[value].casefold())

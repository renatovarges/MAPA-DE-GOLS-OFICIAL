
try:
    with open('script.js', 'r', encoding='utf-8', errors='replace') as f:
        text = f.read()
        
    idx = text.find('\u2030')
    if idx != -1:
        print(f"Found per mille at {idx}")
        start = max(0, idx - 50)
        end = min(len(text), idx + 50)
        print(f"Context: {text[start:end]}")
    else:
        print("Per mille not found.")
        
    # check for other chars that map to 0x80-0x9F in cp1252
    # Euro sign € (20AC) -> 80
    # ...
    # '…' (2026) -> 85
    # '†' (2020) -> 86
    # '‡' (2021) -> 87
    # '‰' (2030) -> 89
    
    chars_to_check = {
        '\u20ac': 'Euro',
        '\u2026': 'Ellipsis',
        '\u2020': 'Dagger',
        '\u2021': 'Double Dagger',
        '\u2030': 'Per Mille',
        '\u2018': 'Quote Left',
        '\u2019': 'Quote Right'
    }
    
    for c, name in chars_to_check.items():
        i = text.find(c)
        if i != -1:
            print(f"Found {name} ({c}) at {i}")
            print(f"Context: {text[max(0, i-20):min(len(text), i+20)]}")

except Exception as e:
    print(f"Error: {e}")

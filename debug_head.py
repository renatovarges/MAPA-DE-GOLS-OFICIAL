
try:
    with open('script.js', 'rb') as f:
        head = f.read(100)
        
    print(f"Header bytes: {head.hex()}")
    print(f"Header ascii: {head}")
except Exception as e:
    print(f"Error: {e}")

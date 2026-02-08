
try:
    with open('script.js', 'rb') as f:
        f.seek(0, 2)
        size = f.tell()
        f.seek(max(0, size - 200))
        tail = f.read()
        
    print(f"Tail size: {len(tail)}")
    print(f"Tail hex: {tail.hex()}")
    try:
        print(f"Tail utf8: {tail.decode('utf-8', errors='replace')}")
    except:
        pass
except Exception as e:
    print(f"Error: {e}")

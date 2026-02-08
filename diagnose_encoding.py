
import sys

try:
    with open('script.js', 'rb') as f:
        content = f.read()
        
    print(f"File size: {len(content)} bytes")
    
    # Look for the legend definitions which we know are messed up
    # "Assistência" appearing as "AssistÃªncia" or similar
    
    snippet_start = content.find(b'Assist')
    if snippet_start != -1:
        snippet = content[snippet_start:snippet_start+50]
        print(f"Snippet (raw bytes): {snippet}")
        try:
            print(f"Snippet (decoded utf-8): {snippet.decode('utf-8')}")
        except Exception as e:
            print(f"Snippet failed utf-8 decode: {e}")
            
        try:
            # If it was UTF-8 bytes read as Latin-1/CP1252 and then saved as UTF-8
            # We might see double encoding.
            # Let's try to interpret the current utf-8 as latin-1 to see if we get back header bytes
            decoded = snippet.decode('utf-8')
            print(f"Snippet (as utf-8): {decoded}")
            # Identify mojibake: "Ãª" is C3 AA in latin-1. In UTF-8 "ê" is C3 AA. 
            # If we see C3 83 C2 AA ... that's a double encoding. 
            
        except Exception as e:
            print(f"Analysis error: {e}")

except Exception as e:
    print(f"Error: {e}")

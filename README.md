This is a Silly Tavern Extension to work with the webui.py of the index-tts2 TTS Server. 
It is a bit bare bones right now, but it works for me now. 
Also this is my first Extension, so i might have done a few things in an unusual way.

## Requirements

https://github.com/index-tts/index-tts
Have this installed and reachable from your browser. 
Just follow the install guide on the Github Page from index-tts and test it first directly in the webui it comes with. 

## How to use

1. Launch the webui.py using uv run webui.py of the tts2 install. (Im running it in my WSL Ubuntu, as it was much easier to install on linux than windows)
2. Open the WebUi for TTS2 (default: http://127.0.0.1:7860/)
3. Open the Dev Console and switch to Network Tab (F12)
4. Upload/Drag in a reference voice and look for the POST Call in the Network tab
5. Switch to the response Tab and copy the File Path:  /tmp/gradio/xxxxxxx/yyy.mp3
<img width="2364" height="201" alt="image" src="https://github.com/user-attachments/assets/0699e5f4-8d71-4237-af97-25fe616247df" />


6. Install this extension in your Silly Tavern
<img width="751" height="149" alt="image" src="https://github.com/user-attachments/assets/08b0f40d-4473-4274-9966-87234d94f635" />


7. Open the settings for this extension and set the URL of your indextt2 server (Same as step 1), copy the file path of the reference voice (step5) into reference file path, then test the extension using the test message (in your indextts logs you should see a generation start and hear the message right after)
<img width="860" height="512" alt="image" src="https://github.com/user-attachments/assets/c68bb4d3-a765-4a86-a93b-50d923079a85" />


8. Have fun trying out different emotion values and voices. 
9. It should automatically generate and play all quoted parts of a response message after receiving a message from a character.

## Things i want to add to this

1. I already played with the Character Expression Extension to automatically set values of the emotions depending on the character expression, but i haven't got this to work yet.
2. Multiple Character voices
3. Easier Upload of Reference Voices directly in ST
4. Narrator voice integration




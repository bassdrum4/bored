package FlashAd_fla
{
   import com.newgrounds.components.APIConnector;
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol129")]
   public dynamic class NewgroundsAPIAsset_Login_Warning_9 extends MovieClip
   {
      
      public function NewgroundsAPIAsset_Login_Warning_9()
      {
         super();
         addFrameScript(9,this.frame10,20,this.frame21);
      }
      
      internal function frame10() : *
      {
         stop();
      }
      
      internal function frame21() : *
      {
         APIConnector(parent).clear();
      }
   }
}


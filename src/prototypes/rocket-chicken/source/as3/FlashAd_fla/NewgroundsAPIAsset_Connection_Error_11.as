package FlashAd_fla
{
   import com.newgrounds.components.APIConnector;
   import flash.display.MovieClip;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol133")]
   public dynamic class NewgroundsAPIAsset_Connection_Error_11 extends MovieClip
   {
      
      public function NewgroundsAPIAsset_Connection_Error_11()
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

